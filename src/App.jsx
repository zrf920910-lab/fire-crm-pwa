import React, { useState, useEffect, useMemo } from 'react';

// ==========================================
// 默认日志数据与版本历史 (不写死，方便后续维护追溯)
// ==========================================
const SYSTEM_LOGS = [
  { version: "v1.1.0", date: "2026-06-28", desc: "导入机制升级。新增 CSV/TSV 智能分隔符识别，支持 Excel 复制内容一键直接粘帖，强化无表头及缺省字段自适应填充。" },
  { version: "v1.0.0", date: "2026-06-28", desc: "消防CRM基础版本上线。支持首页四大开单工具、SKU管理、客户管理、全模块原生数据导入导出以及带安全锁的Google Sheet云备份系统。" }
];

export default function App() {
  // ==========================================
  // 1. 全局数据持久化初始化
  // ==========================================
  const [skus, setSkus] = useState(() => JSON.parse(localStorage.getItem('crm_skus') || '[]'));
  const [customers, setCustomers] = useState(() => JSON.parse(localStorage.getItem('crm_customers') || '[]'));
  
  // 基础设置与安全云同步状态
  const [profile, setProfile] = useState(() => JSON.parse(localStorage.getItem('crm_profile') || JSON.stringify({
    username: '消防管理员',
    sheetUrl: '',
    hasSynced: false // 云同步安全锁：新设备初始需强制下载一次，避免空数据覆盖云端
  })));

  const [activeTab, setActiveTab] = useState('home'); // home | products | customers | profile
  const [currentModal, setCurrentModal] = useState(null); // sales | quote | contract-general | contract-special

  // 搜索关键字
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // 提示信息通知
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  // 自动持久化本地缓存钩子
  useEffect(() => {
    localStorage.setItem('crm_skus', JSON.stringify(skus));
  }, [skus]);

  useEffect(() => {
    localStorage.setItem('crm_customers', JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    localStorage.setItem('crm_profile', JSON.stringify(profile));
  }, [profile]);

  const triggerToast = (msg, type = 'success') => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

  // ==========================================
  // 2. 原生表格 CSV 数据导出
  // ==========================================
  const exportDataToCSV = (filename, headers, rows) => {
    const csvContent = "\ufeff" + [
      headers.join(","),
      ...rows.map(row => row.map(val => `"${(val || '').toString().replace(/"/g, '""')}"`).join(","))
    ].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ==========================================
  // 3. 智能 CSV/TSV 导入模块 (支持一键粘帖 Excel 与最简数据)
  // ==========================================
  const handleCSVImport = (text, type) => {
    // 将输入按行拆分，过滤掉空行
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) {
      triggerToast('未检测到有效数据', 'error');
      return;
    }

    // 智能识别分隔符：支持 逗号(,)、制表符(\\t - Excel默认复制格式)、分号(;)、竖线(|)
    const separators = [',', '\\t', ';', '|'];
    let bestSep = ',';
    let maxCount = -1;
    // 拿前3行进行高频分隔符测试
    const testLines = lines.slice(0, 3);
    separators.forEach(sep => {
      let count = 0;
      const regexSep = sep === '\\t' ? '\t' : sep;
      testLines.forEach(l => {
        count += (l.split(regexSep).length - 1);
      });
      if (count > maxCount) {
        maxCount = count;
        bestSep = regexSep;
      }
    });

    // 通用行切分与去引号清洗函数
    const parseLine = (line) => {
      return line.split(bestSep).map(c => {
        let cleaned = c.trim();
        // 清洗可能包裹在字段外侧的单双引号
        if ((cleaned.startsWith('"') && cleaned.endsWith('"')) || 
            (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
          cleaned = cleaned.substring(1, cleaned.length - 1);
        }
        return cleaned.trim();
      });
    };

    const parsedLines = lines.map(parseLine);
    const firstLine = parsedLines[0];

    // ==========================================
    // 规则 A：商品 SKU 智能导入
    // ==========================================
    if (type === 'sku') {
      // 智能推断第一行是否为表头
      const skuKeywords = ['名', 'sku', '商品', '品名', '价格', '单价', '进价', '金额', '进货价', '品牌', '单位', '备注', 'name', 'price', 'brand', 'unit', 'remarks'];
      let hasHeader = firstLine.some(cell => skuKeywords.some(keyword => cell.toLowerCase().includes(keyword)));
      
      // 安全校正：如果第一行第二列能直接解析为非零数值，说明很可能是无表头的数据行，强制判定为无表头
      if (firstLine[1] !== undefined && !isNaN(parseFloat(firstLine[1])) && isFinite(firstLine[1])) {
        hasHeader = false;
      }

      let dataLines = parsedLines;
      let colMap = { name: 0, price: 1, brand: 2, unit: 3, remarks: 4 };

      if (hasHeader) {
        dataLines = parsedLines.slice(1);
        // 根据表头文字自适应映射列索引
        firstLine.forEach((cell, idx) => {
          const val = cell.toLowerCase();
          if (val.includes('名') || val.includes('sku') || val.includes('name')) colMap.name = idx;
          else if (val.includes('价') || val.includes('额') || val.includes('price')) colMap.price = idx;
          else if (val.includes('牌') || val.includes('brand')) colMap.brand = idx;
          else if (val.includes('单') || val.includes('位') || val.includes('unit')) colMap.unit = idx;
          else if (val.includes('备') || val.includes('注') || val.includes('remark')) colMap.remarks = idx;
        });
      } else {
        // 无表头时智能猜测：寻找第一行里第一个能转化为有效数字的列作为价格列
        let priceIdx = -1;
        for (let i = 0; i < firstLine.length; i++) {
          const num = parseFloat(firstLine[i]);
          if (!isNaN(num) && isFinite(firstLine[i]) && num > 0) {
            priceIdx = i;
            break;
          }
        }
        if (priceIdx !== -1) {
          colMap.price = priceIdx;
          colMap.name = priceIdx === 0 ? 1 : 0; // 若第0列就是价格，则第1列作为名称；否则默认第0列为名称
        } else {
          colMap.name = 0;
          colMap.price = 1; // 备用降级策略：第0列名称，第1列价格
        }
        // 猜测其余可能存在的属性列
        let remaining = [];
        for (let i = 0; i < firstLine.length; i++) {
          if (i !== colMap.name && i !== colMap.price) remaining.push(i);
        }
        colMap.brand = remaining[0] !== undefined ? remaining[0] : -1;
        colMap.unit = remaining[1] !== undefined ? remaining[1] : -1;
        colMap.remarks = remaining[2] !== undefined ? remaining[2] : -1;
      }

      const newSkus = [];
      dataLines.forEach(cols => {
        const name = cols[colMap.name];
        if (!name || name.trim() === '') return; // 必须拥有名称，否则丢弃空行

        const priceVal = colMap.price !== -1 ? cols[colMap.price] : '';
        const price = parseFloat(priceVal) || 0;

        // 宽容模式：若品牌、单位为空，赋予默认业务初始值
        const brand = (colMap.brand !== -1 && cols[colMap.brand]) ? cols[colMap.brand] : '通用';
        const unit = (colMap.unit !== -1 && cols[colMap.unit]) ? cols[colMap.unit] : '个';
        const remarks = (colMap.remarks !== -1 && cols[colMap.remarks]) ? cols[colMap.remarks] : '';

        newSkus.push({
          id: 'sku_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: name.trim(),
          purchasePrice: price,
          brand,
          unit,
          remarks
        });
      });

      setSkus(prev => [...prev, ...newSkus]);
      triggerToast(`成功导入 ${newSkus.length} 条消防物资`);
    }

    // ==========================================
    // 规则 B：客户名单智能导入
    // ==========================================
    else if (type === 'customer') {
      const custKeywords = ['名', '公司', '客户', '单位', '税', '地', '址', '联系', '人', '账', '行', '电', '话', '手机', 'customer', 'company', 'name', 'tax', 'address', 'phone'];
      let hasHeader = firstLine.some(cell => custKeywords.some(keyword => cell.toLowerCase().includes(keyword)));

      // 手机号安全校正：如果发现首行含有11位连续数字（很可能是电话），则强制认为这是无表头的首行数据
      if (firstLine.some(cell => /^\d{11}$/.test(cell))) {
        hasHeader = false;
      }

      let dataLines = parsedLines;
      let colMap = { name: 0, company: 0, taxId: -1, address: -1, contact: -1, account: -1, bank: -1, phone: -1 };

      if (hasHeader) {
        dataLines = parsedLines.slice(1);
        firstLine.forEach((cell, idx) => {
          const val = cell.toLowerCase();
          if (val.includes('名') || val.includes('公司') || val.includes('客户') || val.includes('单位') || val.includes('name') || val.includes('company')) {
            colMap.name = idx;
            colMap.company = idx;
          } else if (val.includes('税') || val.includes('tax')) colMap.taxId = idx;
          else if (val.includes('地') || val.includes('址') || val.includes('address')) colMap.address = idx;
          else if (val.includes('联系') || val.includes('人') || val.includes('contact')) colMap.contact = idx;
          else if (val.includes('账') || val.includes('卡') || val.includes('account')) colMap.account = idx;
          else if (val.includes('行') || val.includes('bank')) colMap.bank = idx;
          else if (val.includes('电') || val.includes('话') || val.includes('手机') || val.includes('phone') || val.includes('tel')) colMap.phone = idx;
        });
      } else {
        // 无表头猜测：默认第 0 列为客户名称
        colMap.name = 0;
        colMap.company = 0;

        // 根据长度与内容特征智能匹配其余列
        for (let i = 1; i < firstLine.length; i++) {
          const val = firstLine[i];
          if (/^\d{11}$/.test(val) || (/^\d+-\d+$/.test(val))) {
            colMap.phone = i; // 11位数字或带横杠的判定为电话
          } else if (val.length >= 15 && val.length <= 20 && /^[a-zA-Z0-9]+$/.test(val)) {
            colMap.taxId = i; // 15-20位纯英文数字判定为纳税号
          } else if (val.includes('省') || val.includes('市') || val.includes('区') || val.includes('路') || val.includes('号')) {
            colMap.address = i; // 地址识别
          } else if (val.length >= 2 && val.length <= 4) {
            colMap.contact = i; // 2-4个字的判定为联系人姓名
          }
        }

        // 把没有被特殊识别的闲置列分配给银行/账号
        let assigned = Object.values(colMap).filter(v => v !== -1);
        let unassigned = [];
        for (let i = 0; i < firstLine.length; i++) {
          if (!assigned.includes(i)) unassigned.push(i);
        }
        if (colMap.bank === -1 && unassigned.length > 0) colMap.bank = unassigned.shift();
        if (colMap.account === -1 && unassigned.length > 0) colMap.account = unassigned.shift();
      }

      const newCusts = [];
      dataLines.forEach(cols => {
        const name = cols[colMap.name];
        if (!name || name.trim() === '') return;

        newCusts.push({
          id: 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: name.trim(),
          company: (colMap.company !== -1 && cols[colMap.company]) ? cols[colMap.company].trim() : name.trim(),
          taxId: (colMap.taxId !== -1 && cols[colMap.taxId]) ? cols[colMap.taxId].trim() : '',
          address: (colMap.address !== -1 && cols[colMap.address]) ? cols[colMap.address].trim() : '',
          contact: (colMap.contact !== -1 && cols[colMap.contact]) ? cols[colMap.contact].trim() : '',
          account: (colMap.account !== -1 && cols[colMap.account]) ? cols[colMap.account].trim() : '',
          bank: (colMap.bank !== -1 && cols[colMap.bank]) ? cols[colMap.bank].trim() : '',
          phone: (colMap.phone !== -1 && cols[colMap.phone]) ? cols[colMap.phone].trim() : '',
          exclusivePrices: {}
        });
      });

      setCustomers(prev => [...prev, ...newCusts]);
      triggerToast(`成功导入 ${newCusts.length} 位客户数据`);
    }
  };

  // ==========================================
  // 4. Google Sheet 云安全同步模块 (双向防覆盖机制)
  // ==========================================
  const handleCloudBackup = async (action) => {
    if (!profile.sheetUrl) {
      triggerToast('请先在“我的”页面配置云备份URL', 'error');
      return;
    }

    if (action === 'upload' && !profile.hasSynced) {
      triggerToast('⚠️ 新设备安全警告：请先执行下载备份，防止本地空白数据覆盖云端！', 'error');
      return;
    }

    try {
      if (action === 'upload') {
        const payload = { skus, customers };
        await fetch(profile.sheetUrl, {
          method: 'POST',
          mode: 'no-cors', // 适配谷歌Apps Script无源跨域
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upload', payload })
        });
        triggerToast('本地数据已备份到云端（请确认Apps Script端无误）');
      } else if (action === 'download') {
        const res = await fetch(profile.sheetUrl);
        const result = await res.json();
        if (result.success && result.data) {
          const cloudData = result.data;
          if (cloudData.skus) setSkus(cloudData.skus);
          if (cloudData.customers) setCustomers(cloudData.customers);
          setProfile(prev => ({ ...prev, hasSynced: true }));
          triggerToast('云端数据下载并恢复成功！已为您解除安全限制。');
        } else {
          triggerToast('云端尚无历史备份，已为您激活首次备份权限！');
          setProfile(prev => ({ ...prev, hasSynced: true }));
        }
      }
    } catch (e) {
      triggerToast('同步失败，请检查脚本URL、网络或CORS限制', 'error');
    }
  };

  // ==========================================
  // 5. 子模块局部视图临时状态
  // ==========================================
  const [editingSku, setEditingSku] = useState(null);
  const [isAddingSku, setIsAddingSku] = useState(false);
  const [skuForm, setSkuForm] = useState({ name: '', purchasePrice: '', brand: '', unit: '', remarks: '' });
  const [bulkInputType, setBulkInputType] = useState(null); // 'sku' | 'customer'
  const [bulkText, setBulkText] = useState('');

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', company: '', taxId: '', address: '', contact: '', account: '', bank: '', phone: '' });
  const [viewingExclusivePrice, setViewingExclusivePrice] = useState(null);

  // 快捷生成销售单/合同所关联的元数据
  const [docMeta, setDocMeta] = useState({
    ourCompany: '中国消防设备服务有限公司',
    selectedCustomerId: '',
    date: new Date().toISOString().split('T')[0],
    title: '消防系统采购与维护单',
    taxRate: 13,
    deliveryTerms: '卖方负责运送至买方指定地点，买方卸货。',
    paymentTerms: '合同签订之日起 3 个工作日内，买方付清全部款项。',
    items: [{ skuName: '', brand: '通用', unit: '个', qty: 1, unitPrice: 0, amount: 0, remarks: '' }]
  });

  // 智能化关联：选择商品名称时，自适应匹配其品牌、单位及针对该客商的专属报价或默认采购价 [2]
  const updateDocItemSku = (index, skuName) => {
    const foundSku = skus.find(s => s.name === skuName);
    const selectedCust = customers.find(c => c.id === docMeta.selectedCustomerId);
    
    let targetPrice = 0;
    let targetBrand = '通用';
    let targetUnit = '个';

    if (foundSku) {
      targetBrand = foundSku.brand;
      targetUnit = foundSku.unit;
      if (selectedCust && selectedCust.exclusivePrices && selectedCust.exclusivePrices[foundSku.id] !== undefined) {
        targetPrice = selectedCust.exclusivePrices[foundSku.id];
      } else {
        targetPrice = foundSku.purchasePrice;
      }
    }

    const updatedItems = [...docMeta.items];
    updatedItems[index] = {
      ...updatedItems[index],
      skuName,
      brand: targetBrand,
      unit: targetUnit,
      unitPrice: targetPrice,
      amount: targetPrice * (updatedItems[index].qty || 1)
    };
    setDocMeta({ ...docMeta, items: updatedItems });
  };

  // 销售单保存事件：自动反向补全未登记 SKU 且绑定为专属客户价格
  const saveFormAndTriggerUpdates = () => {
    if (!docMeta.selectedCustomerId) {
      triggerToast('请选择客户后再保存', 'error');
      return;
    }
    
    const targetCust = customers.find(c => c.id === docMeta.selectedCustomerId);
    let updatedSkus = [...skus];
    let updatedCustomers = [...customers];

    docMeta.items.forEach(item => {
      if (!item.skuName.trim()) return;
      let foundSku = updatedSkus.find(s => s.name.trim() === item.skuName.trim());
      
      // 1. 如果商品库不存在该商品，自动补录
      if (!foundSku) {
        foundSku = {
          id: 'sku_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: item.skuName.trim(),
          purchasePrice: 0, // 自动新增的 SKU 进货底价初始化默认为 0
          brand: item.brand || '自动生成',
          unit: item.unit || '个',
          remarks: '由销售开单模块反向同步补齐'
        };
        updatedSkus.push(foundSku);
      }

      // 2. 绑定当前设置单价为该特定客户的“专属销售价格”
      updatedCustomers = updatedCustomers.map(c => {
        if (c.id === targetCust.id) {
          return {
            ...c,
            exclusivePrices: {
              ...c.exclusivePrices,
              [foundSku.id]: parseFloat(item.unitPrice) || 0
            }
          };
        }
        return c;
      });
    });

    setSkus(updatedSkus);
    setCustomers(updatedCustomers);
    setCurrentModal(null);
    triggerToast('销售单保存成功，缺失的商品及客商专属价格已反向同步更新！');
  };

  const filteredSkus = useMemo(() => {
    return skus.filter(s => s.name.toLowerCase().includes(productSearch.toLowerCase()) || (s.brand && s.brand.toLowerCase().includes(productSearch.toLowerCase())));
  }, [skus, productSearch]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.contact && c.contact.toLowerCase().includes(customerSearch.toLowerCase())));
  }, [customers, customerSearch]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col shadow-xl relative pb-20 font-sans">
      
      {/* 1. 顶部状态栏 */}
      <header className="bg-red-600 text-white p-4 sticky top-0 z-40 flex justify-between items-center shadow-md">
        <h1 className="text-lg font-bold tracking-wider">🧯 消防安全CRM系统</h1>
        <span className="text-xs bg-red-700 px-2.5 py-1 rounded-full border border-red-500">本地持久</span>
      </header>

      {/* Toast 通用通知 */}
      {toast.show && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm text-white font-medium animate-bounce ${toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          {toast.message}
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 1: 首页 TAB */}
      {/* ======================================================== */}
      {activeTab === 'home' && (
        <div className="p-4 space-y-6 flex-1">
          <div className="bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
            <h2 className="text-xl font-bold mb-1">今日快捷开单系统</h2>
            <p className="text-xs opacity-90 mb-4">保存开单时，系统将智能提取并反向填充缺失的 SKU 商品属性</p>
            <div className="flex gap-4 text-center">
              <div className="flex-1 bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
                <div className="text-lg font-semibold">{skus.length}</div>
                <div className="text-[10px] opacity-75">系统商品</div>
              </div>
              <div className="flex-1 bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
                <div className="text-lg font-semibold">{customers.length}</div>
                <div className="text-[10px] opacity-75">商客档案</div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider pl-1">单据与合同生成</h3>
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => { setCurrentModal('sales'); setDocMeta({...docMeta, items: [{ skuName: '', brand: '通用', unit: '个', qty: 1, unitPrice: 0, amount: 0, remarks: '' }]}); }} className="flex flex-col items-center justify-center p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-red-400 active:scale-95 transition-all">
                <span className="text-3xl mb-2">📋</span>
                <span className="font-semibold text-slate-800 text-sm">销售单</span>
              </button>
              
              <button onClick={() => { setCurrentModal('quote'); setDocMeta({...docMeta, items: [{ skuName: '', brand: '通用', unit: '个', qty: 1, unitPrice: 0, amount: 0, remarks: '' }]}); }} className="flex flex-col items-center justify-center p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-red-400 active:scale-95 transition-all">
                <span className="text-3xl mb-2">🏷️</span>
                <span className="font-semibold text-slate-800 text-sm">报价单</span>
              </button>

              <button onClick={() => { setCurrentModal('contract-general'); setDocMeta({...docMeta, taxRate: 1, items: [{ skuName: '', brand: '通用', unit: '个', qty: 1, unitPrice: 0, amount: 0, remarks: '' }]}); }} className="flex flex-col items-center justify-center p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-red-400 active:scale-95 transition-all">
                <span className="text-3xl mb-2">📄</span>
                <span className="font-semibold text-slate-800 text-sm">采购合同 (普票)</span>
              </button>

              <button onClick={() => { setCurrentModal('contract-special'); setDocMeta({...docMeta, taxRate: 13, items: [{ skuName: '', brand: '通用', unit: '个', qty: 1, unitPrice: 0, amount: 0, remarks: '' }]}); }} className="flex flex-col items-center justify-center p-5 bg-white border border-slate-100 rounded-2xl shadow-sm hover:border-red-400 active:scale-95 transition-all">
                <span className="text-3xl mb-2">🎖️</span>
                <span className="font-semibold text-slate-800 text-sm">采购合同 (专票)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 2: 商品 TAB */}
      {/* ======================================================== */}
      {activeTab === 'products' && (
        <div className="p-4 flex-1 space-y-4">
          <input
            type="text"
            placeholder="🔍 输入商品名称 / 品牌进行搜索..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
          />

          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setSkuForm({ name: '', purchasePrice: '', brand: '通用', unit: '个', remarks: '' }); setIsAddingSku(true); }} className="bg-red-600 text-white py-2 rounded-lg text-xs font-semibold shadow-sm active:bg-red-700">
              添加 SKU
            </button>
            <button onClick={() => setBulkInputType('sku')} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm active:bg-slate-300">
              批量导入
            </button>
            <button onClick={() => exportDataToCSV('商品库存导出.csv', ['商品名称', '进货价格', '品牌', '单位', '备注'], skus.map(s => [s.name, s.purchasePrice, s.brand, s.unit, s.remarks]))} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm active:bg-slate-300">
              导出表格
            </button>
          </div>

          <div className="space-y-2">
            {filteredSkus.map(item => (
              <div key={item.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">{item.name}</h4>
                  <div className="flex gap-2 text-xs text-slate-400 mt-1">
                    <span>品牌: {item.brand || '未设定'}</span>
                    <span>|</span>
                    <span>单位: {item.unit || '个'}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">备注: {item.remarks || '-'}</p>
                </div>
                <div className="text-right">
                  <div className="text-red-600 font-bold text-sm">¥{item.purchasePrice}</div>
                  <button onClick={() => { setEditingSku(item); setSkuForm({ ...item }); }} className="text-xs text-blue-500 underline mt-1.5 inline-block">
                    编辑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 3: 客户 TAB */}
      {/* ======================================================== */}
      {activeTab === 'customers' && (
        <div className="p-4 flex-1 space-y-4">
          <input
            type="text"
            placeholder="🔍 输入客户公司 / 姓名 / 电话搜索..."
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-sm"
            value={customerSearch}
            onChange={(e) => setCustomerSearch(e.target.value)}
          />

          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setCustomerForm({ name: '', company: '', taxId: '', address: '', contact: '', account: '', bank: '', phone: '' }); setIsAddingCustomer(true); }} className="bg-red-600 text-white py-2 rounded-lg text-xs font-semibold shadow-sm active:bg-red-700">
              添加客户
            </button>
            <button onClick={() => setBulkInputType('customer')} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm active:bg-slate-300">
              批量导入
            </button>
            <button onClick={() => exportDataToCSV('客户名单导出.csv', ['客户名称', '税号', '地址', '联系人', '账户', '开户行', '电话'], customers.map(c => [c.name, c.taxId, c.address, c.contact, c.account, c.bank, c.phone]))} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm active:bg-slate-300">
              导出表格
            </button>
          </div>

          <div className="space-y-2">
            {filteredCustomers.map(c => (
              <div key={c.id} className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm flex justify-between items-center">
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">{c.name}</h4>
                  <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                    <p>联系人: {c.contact || '-'} | {c.phone || '-'}</p>
                    <p className="text-[10px] truncate max-w-[220px]">单位: {c.company || '-'}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-right">
                  <button onClick={() => { setEditingCustomer(c); setCustomerForm({ ...c }); }} className="text-xs text-slate-600 bg-slate-100 py-1 px-2.5 rounded-md hover:bg-slate-200">
                    档案编辑
                  </button>
                  <button onClick={() => setViewingExclusivePrice(c)} className="text-xs text-white bg-red-500 py-1 px-2.5 rounded-md hover:bg-red-600">
                    专属价格
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* VIEW 4: 我的 TAB (安全同步、维护日志) */}
      {/* ======================================================== */}
      {activeTab === 'profile' && (
        <div className="p-4 flex-1 space-y-6">
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">⚙️</span>
            </div>
            <h3 className="font-bold text-slate-800 text-base">{profile.username}</h3>
            <p className="text-xs text-slate-400 mt-1">本地安全运行模式</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-4">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <span>☁️</span> Google Sheets 备份配置
            </h4>
            
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Google Apps Script Web App URL</label>
              <input
                type="password"
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-red-500"
                value={profile.sheetUrl}
                onChange={(e) => setProfile({ ...profile, sheetUrl: e.target.value, hasSynced: false })}
              />
            </div>

            {profile.sheetUrl && !profile.hasSynced && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 leading-relaxed">
                ⚠️ <strong>安全提示：</strong> 检测到新的云端链路。为防止本地空数据覆盖并损毁云备份，<strong>本地推送功能现已锁定</strong>。请必须先执行 <strong>下载并恢复云端</strong>。
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => handleCloudBackup('download')}
                className="bg-sky-600 text-white py-2 px-3 rounded-lg text-xs font-semibold shadow-sm hover:bg-sky-700"
              >
                📥 下载并恢复云端
              </button>
              <button
                disabled={profile.sheetUrl !== "" && !profile.hasSynced}
                onClick={() => handleCloudBackup('upload')}
                className={`py-2 px-3 rounded-lg text-xs font-semibold shadow-sm text-white ${
                  profile.sheetUrl !== "" && !profile.hasSynced
                    ? 'bg-slate-300 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                📤 备份到云端
              </button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
              <span>📝</span> 系统更新/维护日志
            </h4>
            <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
              {SYSTEM_LOGS.map((log, index) => (
                <div key={index} className="border-l-2 border-red-500 pl-3 py-0.5">
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{log.version}</span>
                    <span className="text-slate-400">{log.date}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{log.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 弹窗及抽屉：CSV 批量解析 & 添加商品/客商 */}
      {/* ======================================================== */}

      {bulkInputType && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base">
              批量导入 ({bulkInputType === 'sku' ? '商品' : '客户'})
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              支持逗号分割 CSV，或从 Excel 表格中直接复制整列并粘帖到下方。系统将自适应解析 [2]：
            </p>
            <textarea
              rows="6"
              className="w-full border border-slate-200 rounded-xl p-3 text-xs focus:ring-1 focus:ring-red-500"
              placeholder={bulkInputType === 'sku' ? "示例 1 (仅商品和进价):\n消防栓箱 420\n烟感探头 45\n\n示例 2 (完整格式):\n品名,价格,品牌,单位\n干粉灭火器,65,XX牌,个" : "客户公司名称,税号,地址,联系人,电话\nXX消防工程公司,91320...,XX路,王经理,138..."}
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
            />
            <div className="flex gap-3">
              <button onClick={() => setBulkInputType(null)} className="flex-1 bg-slate-100 py-2.5 rounded-xl text-xs font-semibold text-slate-600">
                取消
              </button>
              <button onClick={() => { handleCSVImport(bulkText, bulkInputType); setBulkText(''); setBulkInputType(null); }} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-xs font-semibold">
                开始导入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SKU 增加及编辑 */}
      {(isAddingSku || editingSku) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base">{isAddingSku ? '新增消防物资' : '编辑消防物资'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="商品名称" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.name} onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })} />
              <input type="number" placeholder="进货价格 (元)" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.purchasePrice} onChange={(e) => setSkuForm({ ...skuForm, purchasePrice: parseFloat(e.target.value) || 0 })} />
              <input type="text" placeholder="生产品牌" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.brand} onChange={(e) => setSkuForm({ ...skuForm, brand: e.target.value })} />
              <input type="text" placeholder="计量单位" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.unit} onChange={(e) => setSkuForm({ ...skuForm, unit: e.target.value })} />
              <input type="text" placeholder="备注信息" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.remarks} onChange={(e) => setSkuForm({ ...skuForm, remarks: e.target.value })} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsAddingSku(false); setEditingSku(null); }} className="flex-1 bg-slate-100 py-2.5 rounded-xl text-xs font-semibold text-slate-600">取消</button>
              <button onClick={() => {
                if (isAddingSku) {
                  setSkus([...skus, { ...skuForm, id: 'sku_' + Date.now() }]);
                  setIsAddingSku(false);
                } else {
                  setSkus(skus.map(s => s.id === editingSku.id ? { ...skuForm, id: editingSku.id } : s));
                  setEditingSku(null);
                }
                triggerToast('物资配置更新成功！');
              }} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-xs font-semibold">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 客户添加及编辑 */}
      {(isAddingCustomer || editingCustomer) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3 overflow-y-auto max-h-[90vh]">
            <h3 className="font-bold text-slate-800 text-base">{isAddingCustomer ? '登记新客户' : '修改客户档案'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="客户名称/单位" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value, company: e.target.value })} />
              <input type="text" placeholder="纳税人识别号/税号" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.taxId} onChange={(e) => setCustomerForm({ ...customerForm, taxId: e.target.value })} />
              <input type="text" placeholder="注册/通信地址" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} />
              <input type="text" placeholder="联系人" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.contact} onChange={(e) => setCustomerForm({ ...customerForm, contact: e.target.value })} />
              <input type="text" placeholder="开户银行" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.bank} onChange={(e) => setCustomerForm({ ...customerForm, bank: e.target.value })} />
              <input type="text" placeholder="银行账号" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.account} onChange={(e) => setCustomerForm({ ...customerForm, account: e.target.value })} />
              <input type="text" placeholder="联系电话" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} />
            </div>
            <div className="flex gap-3">
              <button onClick={() => { setIsAddingCustomer(false); setEditingCustomer(null); }} className="flex-1 bg-slate-100 py-2.5 rounded-xl text-xs font-semibold text-slate-600">取消</button>
              <button onClick={() => {
                if (isAddingCustomer) {
                  setCustomers([...customers, { ...customerForm, id: 'cust_' + Date.now(), exclusivePrices: {} }]);
                  setIsAddingCustomer(false);
                } else {
                  setCustomers(customers.map(c => c.id === editingCustomer.id ? { ...customerForm, id: editingCustomer.id, exclusivePrices: c.exclusivePrices } : c));
                  setEditingCustomer(null);
                }
                triggerToast('客户档案同步成功！');
              }} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-xs font-semibold">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 客户专属价格抽屉 */}
      {viewingExclusivePrice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 flex flex-col max-h-[85vh]">
            <h3 className="font-bold text-slate-800 text-sm">
              🔑 {viewingExclusivePrice.name} - 专属货品价格
            </h3>
            <div className="flex-1 overflow-y-auto space-y-3">
              {skus.map(s => {
                const isCustom = viewingExclusivePrice.exclusivePrices[s.id] !== undefined;
                const value = isCustom ? viewingExclusivePrice.exclusivePrices[s.id] : s.purchasePrice;
                return (
                  <div key={s.id} className="flex items-center justify-between border-b pb-2 text-xs">
                    <span className="truncate max-w-[150px] font-medium text-slate-700">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">进价: ¥{s.purchasePrice}</span>
                      <input
                        type="number"
                        className={`w-20 px-2 py-1 rounded text-right border ${isCustom ? 'border-red-400 bg-red-50 text-red-600 font-bold' : 'border-slate-200'}`}
                        value={value}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) || 0;
                          const updated = customers.map(c => {
                            if (c.id === viewingExclusivePrice.id) {
                              return {
                                ...c,
                                exclusivePrices: { ...c.exclusivePrices, [s.id]: val }
                              };
                            }
                            return c;
                          });
                          setCustomers(updated);
                          setViewingExclusivePrice(updated.find(c => c.id === viewingExclusivePrice.id));
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setViewingExclusivePrice(null)} className="w-full bg-red-600 text-white py-2.5 rounded-xl text-xs font-semibold">
              确认关闭
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 核心单据和合同生成模块 (支持静默打印) */}
      {/* ======================================================== */}
      {currentModal && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto p-4 flex flex-col">
          {/* 编辑控制后台 */}
          <div className="no-print bg-slate-100 p-4 rounded-xl space-y-3 mb-6">
            <h3 className="font-bold text-slate-800 text-xs">⚙️ 实时合同及开单控制面板</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] text-slate-500">本方开单公司</label>
                <input type="text" className="w-full p-2 border rounded" value={docMeta.ourCompany} onChange={(e) => setDocMeta({...docMeta, ourCompany: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">目标合作客商</label>
                <select className="w-full p-2 border rounded" value={docMeta.selectedCustomerId} onChange={(e) => setDocMeta({...docMeta, selectedCustomerId: e.target.value})}>
                  <option value="">-- 请选择关联客户 --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <button onClick={() => {
                const updatedItems = [...docMeta.items, { skuName: '', brand: '通用', unit: '个', qty: 1, unitPrice: 0, amount: 0, remarks: '' }];
                setDocMeta({...docMeta, items: updatedItems});
              }} className="bg-red-600 text-white py-1 px-3 rounded text-[10px]">
                + 添加新物料行
              </button>
              <div className="flex gap-2">
                <button onClick={() => setCurrentModal(null)} className="bg-slate-300 px-3 py-1 rounded text-[10px]">退出预览</button>
                <button onClick={saveFormAndTriggerUpdates} className="bg-emerald-600 text-white px-3 py-1 rounded text-[10px]">确认存单并同步</button>
                <button onClick={() => window.print()} className="bg-sky-600 text-white px-3 py-1 rounded text-[10px]">🖨️ 打印PDF / 纸张</button>
              </div>
            </div>
          </div>

          {/* 实时单据图版 */}
          <div className="flex-1 border p-6 bg-white shadow-inner text-slate-900 rounded-lg max-w-4xl mx-auto w-full">
            
            {/* 销售单展示 */}
            {currentModal === 'sales' && (
              <div className="space-y-6">
                <div className="text-center">
                  <h1 className="text-xl font-black tracking-widest">{docMeta.ourCompany} 销售单</h1>
                  <p className="text-xs text-slate-400 mt-1">NO: SD-{Date.now().toString().slice(-6)}</p>
                </div>
                <div className="grid grid-cols-2 text-xs border-b pb-3 gap-y-1">
                  <div><strong>购货单位：</strong>{customers.find(c => c.id === docMeta.selectedCustomerId)?.name || '未选择客户'}</div>
                  <div className="text-right"><strong>开单日期：</strong>{docMeta.date}</div>
                </div>
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b">
                      <th className="p-2">货品/服务名称</th>
                      <th className="p-2">品牌</th>
                      <th className="p-2">单位</th>
                      <th className="p-2 text-center">数量</th>
                      <th className="p-2 text-right">单价</th>
                      <th className="p-2 text-right">总额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docMeta.items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-1">
                          <input type="text" className="w-full bg-slate-50 border-0 focus:bg-white" value={item.skuName} onChange={(e) => updateDocItemSku(idx, e.target.value)} placeholder="输入或选填" />
                        </td>
                        <td className="p-1"><input type="text" className="w-full bg-slate-50 border-0" value={item.brand} onChange={(e) => { const its = [...docMeta.items]; its[idx].brand = e.target.value; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-1"><input type="text" className="w-full bg-slate-50 border-0 w-10" value={item.unit} onChange={(e) => { const its = [...docMeta.items]; its[idx].unit = e.target.value; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-1"><input type="number" className="w-full bg-slate-50 border-0 text-center w-12" value={item.qty} onChange={(e) => { const its = [...docMeta.items]; its[idx].qty = parseInt(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-1"><input type="number" className="w-full bg-slate-50 border-0 text-right w-16" value={item.unitPrice} onChange={(e) => { const its = [...docMeta.items]; its[idx].unitPrice = parseFloat(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 text-right font-bold text-slate-800">¥{(item.amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-right font-bold text-sm">
                  合计总额: ¥{docMeta.items.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}
                </div>
              </div>
            )}

            {/* 报价单展示 */}
            {currentModal === 'quote' && (
              <div className="space-y-6">
                <div className="text-center border-b-2 border-red-600 pb-3">
                  <h1 className="text-2xl font-black text-red-600">{docMeta.ourCompany} 报价单</h1>
                  <p className="text-xs text-slate-500 mt-1">专业消防系统集成与设备一站式供应商</p>
                </div>
                <div className="grid grid-cols-2 text-xs gap-y-2 leading-relaxed">
                  <div><strong>致客户：</strong>{customers.find(c => c.id === docMeta.selectedCustomerId)?.name || '未选择客户'}</div>
                  <div className="text-right"><strong>报价单号：</strong>QD-{Date.now().toString().slice(-6)}</div>
                  <div><strong>联系人：</strong>{customers.find(c => c.id === docMeta.selectedCustomerId)?.contact || '-'}</div>
                  <div className="text-right"><strong>报价日期：</strong>{docMeta.date}</div>
                </div>
                <table className="w-full text-xs text-left border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-bold">
                      <th className="p-2 border-r">项目名称</th>
                      <th className="p-2 border-r">品牌规格</th>
                      <th className="p-2 border-r text-center">数量</th>
                      <th className="p-2 border-r text-right">单价</th>
                      <th className="p-2 text-right">小计</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docMeta.items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border-r">
                          <input type="text" className="w-full border-0 focus:outline-none" value={item.skuName} onChange={(e) => updateDocItemSku(idx, e.target.value)} placeholder="输入商品" />
                        </td>
                        <td className="p-2 border-r">
                          <input type="text" className="w-full border-0 focus:outline-none text-slate-500" value={item.brand} onChange={(e) => { const its = [...docMeta.items]; its[idx].brand = e.target.value; setDocMeta({...docMeta, items: its}); }} />
                        </td>
                        <td className="p-2 border-r text-center">
                          <input type="number" className="w-12 border-0 text-center focus:outline-none" value={item.qty} onChange={(e) => { const its = [...docMeta.items]; its[idx].qty = parseInt(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} />
                        </td>
                        <td className="p-2 border-r text-right">
                          <input type="number" className="w-16 border-0 text-right focus:outline-none font-semibold" value={item.unitPrice} onChange={(e) => { const its = [...docMeta.items]; its[idx].unitPrice = parseFloat(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} />
                        </td>
                        <td className="p-2 text-right font-bold">¥{(item.amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-right text-sm font-black text-red-600">
                  最终报价总额: ¥{docMeta.items.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}
                </div>
                <div className="bg-slate-50 p-3 rounded text-[10px] text-slate-500 space-y-1">
                  <p>1. 报价有效期为：30天（由于消防原材料价格浮动较快，请尽早确认）。</p>
                  <p>2. 以上价格已包含常规调试，不包含现场复杂布线及管路改造施工。</p>
                </div>
              </div>
            )}

            {/* 采购合同展示 */}
            {(currentModal === 'contract-general' || currentModal === 'contract-special') && (
              <div className="space-y-6 text-xs text-slate-800 leading-relaxed">
                <div className="text-center">
                  <h1 className="text-xl font-bold">
                    物资采购合同（{currentModal === 'contract-special' ? '增值税专票13%' : '普通发票'}）
                  </h1>
                  <p className="text-[10px] text-slate-400 mt-1">合同编号：HT-{Date.now().toString().slice(-6)}</p>
                </div>

                <div className="space-y-1">
                  <div><strong>买方 (甲方)：</strong>{customers.find(c => c.id === docMeta.selectedCustomerId)?.name || '未选择客户'}</div>
                  <div><strong>卖方 (乙方)：</strong>{docMeta.ourCompany}</div>
                </div>

                <p className="text-[10px] text-slate-600">
                  依据《中华人民共和国民法典》及相关消防工程材料技术规范，甲乙双方本着互惠、自愿、诚信原则，就消防安全器材物资采购事宜，达成如下契约共同遵守：
                </p>

                <table className="w-full text-[10px] text-left border border-slate-300">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr>
                      <th className="p-2 border-r">货物名称</th>
                      <th className="p-2 border-r">品牌</th>
                      <th className="p-2 border-r">单位</th>
                      <th className="p-2 border-r text-center">数量</th>
                      <th className="p-2 border-r text-right">单价</th>
                      <th className="p-2 text-right">总金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docMeta.items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border-r">
                          <input type="text" className="w-full border-0 focus:outline-none" value={item.skuName} onChange={(e) => updateDocItemSku(idx, e.target.value)} placeholder="物料名称" />
                        </td>
                        <td className="p-2 border-r">
                          <input type="text" className="w-full border-0 focus:outline-none" value={item.brand} onChange={(e) => { const its = [...docMeta.items]; its[idx].brand = e.target.value; setDocMeta({...docMeta, items: its}); }} />
                        </td>
                        <td className="p-2 border-r">
                          <input type="text" className="w-full border-0 focus:outline-none" value={item.unit} onChange={(e) => { const its = [...docMeta.items]; its[idx].unit = e.target.value; setDocMeta({...docMeta, items: its}); }} />
                        </td>
                        <td className="p-2 border-r text-center">
                          <input type="number" className="w-10 border-0 text-center focus:outline-none" value={item.qty} onChange={(e) => { const its = [...docMeta.items]; its[idx].qty = parseInt(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} />
                        </td>
                        <td className="p-2 border-r text-right">
                          <input type="number" className="w-14 border-0 text-right focus:outline-none" value={item.unitPrice} onChange={(e) => { const its = [...docMeta.items]; its[idx].unitPrice = parseFloat(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} />
                        </td>
                        <td className="p-2 text-right font-semibold">¥{(item.amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="space-y-1 text-right font-medium">
                  <div>合同总额 (含税价)：¥{docMeta.items.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}</div>
                  {currentModal === 'contract-special' && (
                    <div className="text-[10px] text-slate-500">
                      其中 13% 增值税销项税额：¥{(docMeta.items.reduce((sum, item) => sum + (item.amount || 0), 0) * 0.13 / 1.13).toFixed(2)}
                    </div>
                  )}
                </div>

                <div className="space-y-2 border-t pt-3">
                  <h4 className="font-bold">第一条 交付期限及方式</h4>
                  <p className="text-[10px] text-slate-600">
                    乙方应于本合同生效之日起 7 个工作日内，将上述消防器材运送至买方指定地点。
                  </p>

                  <h4 className="font-bold">第二条 质量保证与验收标准</h4>
                  <p className="text-[10px] text-slate-600">
                    乙方所提供消防设备，其技术指标必须完全符合国家消防安全监督标准。入场验收前，乙方需随货交付国家强制性消防认证证书及出厂合格证。
                  </p>

                  <h4 className="font-bold">第三条 发票与税务条款</h4>
                  <p className="text-[10px] text-slate-600">
                    {currentModal === 'contract-special' 
                      ? "本采购合同采用 13% 增值税专用发票。买方有权在卖方开具足额、合格的增值税专用发票前，拒绝支付后续款项。双方发票与付款账户信息见下方签名区域。"
                      : "本采购合同采用增值税普通发票。卖方收款后应于3个工作日内向买方开具足额的发票。"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t pt-4 text-[10px] leading-relaxed">
                  <div className="space-y-1 border-r pr-2">
                    <p className="font-bold">甲方 (买方/盖章)：</p>
                    <p>税号：{customers.find(c => c.id === docMeta.selectedCustomerId)?.taxId || '-'}</p>
                    <p>开户行：{customers.find(c => c.id === docMeta.selectedCustomerId)?.bank || '-'}</p>
                    <p>账号：{customers.find(c => c.id === docMeta.selectedCustomerId)?.account || '-'}</p>
                    <p>代表签名：</p>
                    <p>签署时间：       年    月    日</p>
                  </div>
                  <div className="space-y-1 pl-2">
                    <p className="font-bold">乙方 (卖方/盖章)：</p>
                    <p>公司：{docMeta.ourCompany}</p>
                    <p>开户行：工商银行消防支行</p>
                    <p>账号：6222 0210 2000 8921 110</p>
                    <p>代表签名：</p>
                    <p>签署时间：       年    月    日</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 底部功能导航区 */}
      {/* ======================================================== */}
      <footer className="no-print fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 z-40 flex h-16">
        <button
          onClick={() => setActiveTab('home')}
          className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'home' ? 'text-red-600' : 'text-slate-400'}`}
        >
          <span className="text-xl">🏠</span>
          <span className="text-[10px] mt-0.5">首页</span>
        </button>
        <button
          onClick={() => setActiveTab('products')}
          className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'products' ? 'text-red-600' : 'text-slate-400'}`}
        >
          <span className="text-xl">📦</span>
          <span className="text-[10px] mt-0.5">商品</span>
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'customers' ? 'text-red-600' : 'text-slate-400'}`}
        >
          <span className="text-xl">👥</span>
          <span className="text-[10px] mt-0.5">客户</span>
        </button>
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'profile' ? 'text-red-600' : 'text-slate-400'}`}
        >
          <span className="text-xl">⚙️</span>
          <span className="text-[10px] mt-0.5">我的</span>
        </button>
      </footer>

    </div>
  );
}