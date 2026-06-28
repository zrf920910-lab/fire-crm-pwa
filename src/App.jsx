import React, { useState, useEffect, useMemo } from 'react';

const SYSTEM_LOGS = [
  { version: "v1.0.0", date: "2026-06-28", desc: "消防CRM基础版本上线。支持首页四大开单工具、SKU管理、客户管理、全模块原生数据导入导出以及带安全锁的Google Sheet云备份系统。" }
];

export default function App() {
  const [skus, setSkus] = useState(() => JSON.parse(localStorage.getItem('crm_skus') || '[]'));
  const [customers, setCustomers] = useState(() => JSON.parse(localStorage.getItem('crm_customers') || '[]'));
  const [profile, setProfile] = useState(() => JSON.parse(localStorage.getItem('crm_profile') || JSON.stringify({
    username: '消防管理员',
    sheetUrl: '',
    hasSynced: false
  })));

  const [activeTab, setActiveTab] = useState('home');
  const [currentModal, setCurrentModal] = useState(null);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'success' });

  useEffect(() => { localStorage.setItem('crm_skus', JSON.stringify(skus)); }, [skus]);
  useEffect(() => { localStorage.setItem('crm_customers', JSON.stringify(customers)); }, [customers]);
  useEffect(() => { localStorage.setItem('crm_profile', JSON.stringify(profile)); }, [profile]);

  const triggerToast = (msg, type = 'success') => {
    setToast({ show: true, message: msg, type });
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000);
  };

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

  const handleCSVImport = (text, type) => {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 2) {
      triggerToast('数据格式不足，请包含表头及至少一行数据', 'error');
      return;
    }
    
    if (type === 'sku') {
      const newSkus = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length >= 2) {
          newSkus.push({
            id: 'sku_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: cols[0],
            purchasePrice: parseFloat(cols[1]) || 0,
            brand: cols[2] || '通用',
            unit: cols[3] || '个',
            remarks: cols[4] || ''
          });
        }
      }
      setSkus(prev => [...prev, ...newSkus]);
      triggerToast(`成功导入 ${newSkus.length} 条商品SKU`);
    } else if (type === 'customer') {
      const newCusts = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
        if (cols.length >= 1) {
          newCusts.push({
            id: 'cust_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name: cols[0],
            company: cols[0],
            taxId: cols[1] || '',
            address: cols[2] || '',
            contact: cols[3] || '',
            account: cols[4] || '',
            bank: cols[5] || '',
            phone: cols[6] || '',
            exclusivePrices: {}
          });
        }
      }
      setCustomers(prev => [...prev, ...newCusts]);
      triggerToast(`成功导入 ${newCusts.length} 位客户数据`);
    }
  };

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
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'upload', payload })
        });
        triggerToast('数据已推送到云端（请确认Apps Script无报错）');
      } else if (action === 'download') {
        const res = await fetch(profile.sheetUrl);
        const result = await res.json();
        if (result.success && result.data) {
          const cloudData = result.data;
          if (cloudData.skus) setSkus(cloudData.skus);
          if (cloudData.customers) setCustomers(cloudData.customers);
          setProfile(prev => ({ ...prev, hasSynced: true }));
          triggerToast('云端数据下载并恢复成功！已为您解除安全上传限制。');
        } else {
          triggerToast('云端尚无备份数据，已为您激活首次备份权限！');
          setProfile(prev => ({ ...prev, hasSynced: true }));
        }
      }
    } catch (e) {
      triggerToast('同步失败，请检查脚本URL、网络或CORS限制', 'error');
    }
  };

  const [editingSku, setEditingSku] = useState(null);
  const [isAddingSku, setIsAddingSku] = useState(false);
  const [skuForm, setSkuForm] = useState({ name: '', purchasePrice: '', brand: '', unit: '', remarks: '' });
  const [bulkInputType, setBulkInputType] = useState(null);
  const [bulkText, setBulkText] = useState('');

  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState({ name: '', company: '', taxId: '', address: '', contact: '', account: '', bank: '', phone: '' });
  const [viewingExclusivePrice, setViewingExclusivePrice] = useState(null);

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

  const updateDocItemSku = (index, skuName) => {
    const foundSku = skus.find(s => s.name === skuName);
    const selectedCust = customers.find(c => c.id === docMeta.selectedCustomerId);
    
    let targetPrice = 0;
    let targetBrand = '通用';
    let targetUnit = '个';

    if (foundSku) {
      targetBrand = foundSku.brand;
      targetUnit = foundSku.unit;
      if (selectedCust && selectedCust.exclusivePrices && selectedCust.exclusivePrices[foundSku.id]) {
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
      
      if (!foundSku) {
        foundSku = {
          id: 'sku_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          name: item.skuName.trim(),
          purchasePrice: 0,
          brand: item.brand || '自动生成',
          unit: item.unit || '个',
          remarks: '由开单系统自动同步'
        };
        updatedSkus.push(foundSku);
      }

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
    triggerToast('数据已存，且系统已自动同步商品信息及专属定价！');
  };

  const filteredSkus = useMemo(() => {
    return skus.filter(s => s.name.toLowerCase().includes(productSearch.toLowerCase()) || (s.brand && s.brand.toLowerCase().includes(productSearch.toLowerCase())));
  }, [skus, productSearch]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c => c.name.toLowerCase().includes(customerSearch.toLowerCase()) || (c.contact && c.contact.toLowerCase().includes(customerSearch.toLowerCase())));
  }, [customers, customerSearch]);

  return (
    <div className="max-w-md mx-auto min-h-screen bg-slate-50 flex flex-col shadow-xl relative pb-20 font-sans">
      <header className="bg-red-600 text-white p-4 sticky top-0 z-40 flex justify-between items-center shadow-md">
        <h1 className="text-lg font-bold tracking-wider">🧯 消防安全CRM系统</h1>
        <span className="text-xs bg-red-700 px-2.5 py-1 rounded-full border border-red-500">本地存储</span>
      </header>

      {toast.show && (
        <div className={`fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm text-white font-medium animate-bounce ${toast.type === 'error' ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          {toast.message}
        </div>
      )}

      {activeTab === 'home' && (
        <div className="p-4 space-y-6 flex-1">
          <div className="bg-gradient-to-br from-red-500 to-orange-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden">
            <h2 className="text-xl font-bold mb-1">今日快捷开单系统</h2>
            <p className="text-xs opacity-90 mb-4">系统支持销售单价格自动回写至客户专属库</p>
            <div className="flex gap-4 text-center">
              <div className="flex-1 bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
                <div className="text-lg font-semibold">{skus.length}</div>
                <div className="text-[10px] opacity-75">系统商品</div>
              </div>
              <div className="flex-1 bg-white/10 rounded-xl p-2.5 backdrop-blur-sm">
                <div className="text-lg font-semibold">{customers.length}</div>
                <div className="text-[10px] opacity-75">客户总数</div>
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

      {activeTab === 'products' && (
        <div className="p-4 flex-1 space-y-4">
          <input type="text" placeholder="🔍 输入商品名称 / 品牌进行搜索..." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setSkuForm({ name: '', purchasePrice: '', brand: '通用', unit: '个', remarks: '' }); setIsAddingSku(true); }} className="bg-red-600 text-white py-2 rounded-lg text-xs font-semibold shadow-sm">添加 SKU</button>
            <button onClick={() => setBulkInputType('sku')} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm">批量导入</button>
            <button onClick={() => exportDataToCSV('商品库存导出.csv', ['商品名称', '进货价格', '品牌', '单位', '备注'], skus.map(s => [s.name, s.purchasePrice, s.brand, s.unit, s.remarks]))} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm">导出表格</button>
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
                  <button onClick={() => { setEditingSku(item); setSkuForm({ ...item }); }} className="text-xs text-blue-500 underline mt-1.5 inline-block">编辑</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'customers' && (
        <div className="p-4 flex-1 space-y-4">
          <input type="text" placeholder="🔍 输入客户公司 / 姓名 / 电话搜索..." className="w-full px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-red-500 text-sm" value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setCustomerForm({ name: '', company: '', taxId: '', address: '', contact: '', account: '', bank: '', phone: '' }); setIsAddingCustomer(true); }} className="bg-red-600 text-white py-2 rounded-lg text-xs font-semibold shadow-sm">添加客户</button>
            <button onClick={() => setBulkInputType('customer')} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm">批量导入</button>
            <button onClick={() => exportDataToCSV('客户名单导出.csv', ['客户名称', '税号', '地址', '联系人', '账户', '开户行', '电话'], customers.map(c => [c.name, c.taxId, c.address, c.contact, c.account, c.bank, c.phone]))} className="bg-slate-200 text-slate-800 py-2 rounded-lg text-xs font-semibold shadow-sm">导出表格</button>
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
                  <button onClick={() => { setEditingCustomer(c); setCustomerForm({ ...c }); }} className="text-xs text-slate-600 bg-slate-100 py-1 px-2.5 rounded-md">档案编辑</button>
                  <button onClick={() => setViewingExclusivePrice(c)} className="text-xs text-white bg-red-500 py-1 px-2.5 rounded-md">专属价格</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><span>☁️</span> Google Sheets 备份配置</h4>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Google Apps Script Web App URL</label>
              <input type="password" placeholder="https://script.google.com/macros/s/.../exec" className="w-full px-3 py-2 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-red-500" value={profile.sheetUrl} onChange={(e) => setProfile({ ...profile, sheetUrl: e.target.value, hasSynced: false })} />
            </div>

            {profile.sheetUrl && !profile.hasSynced && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700 leading-relaxed">
                ⚠️ <strong>安全提示：</strong> 检测到新的云端链路。为防止本地空数据覆盖并损毁云备份，<strong>本地推送功能现已锁定</strong>。请必须先执行 <strong>下载并恢复云端</strong>。
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => handleCloudBackup('download')} className="bg-sky-600 text-white py-2 px-3 rounded-lg text-xs font-semibold shadow-sm">📥 下载并恢复云端</button>
              <button disabled={profile.sheetUrl !== "" && !profile.hasSynced} onClick={() => handleCloudBackup('upload')} className={`py-2 px-3 rounded-lg text-xs font-semibold shadow-sm text-white ${profile.sheetUrl !== "" && !profile.hasSynced ? 'bg-slate-300 cursor-not-allowed' : 'bg-emerald-600'}`}>📤 备份到云端</button>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm space-y-3">
            <h4 className="font-bold text-slate-800 text-sm flex items-center gap-1.5"><span>📝</span> 系统更新/维护日志</h4>
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

      {bulkInputType && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base">批量 CSV 导入 ({bulkInputType === 'sku' ? '商品' : '客户'})</h3>
            <textarea rows="6" className="w-full border border-slate-200 rounded-xl p-3 text-xs" placeholder={bulkInputType === 'sku' ? "商品名称,进货价格,品牌,单位,备注\n灭火器,55.00,XX牌,个,合格品\n消防栓,180.00,国家级,套,全新标配" : "客户名称,税号,地址,联系人,账户,开户行,电话\nXX消防公司,91320...,XX街道,王经理,6222...,招行,138..."} value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
            <div className="flex gap-3">
              <button onClick={() => setBulkInputType(null)} className="flex-1 bg-slate-100 py-2.5 rounded-xl text-xs font-semibold text-slate-600">取消</button>
              <button onClick={() => { handleCSVImport(bulkText, bulkInputType); setBulkText(''); setBulkInputType(null); }} className="flex-1 bg-red-600 text-white py-2.5 rounded-xl text-xs font-semibold">开始导入</button>
            </div>
          </div>
        </div>
      )}

      {(isAddingSku || editingSku) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-base">{isAddingSku ? '新增消防物资' : '编辑消防物资'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="商品名称" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.name} onChange={(e) => setSkuForm({ ...skuForm, name: e.target.value })} />
              <input type="number" placeholder="进货价格 (元)" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.purchasePrice} onChange={(e) => setSkuForm({ ...skuForm, purchasePrice: parseFloat(e.target.value) || 0 })} />
              <input type="text" placeholder="生产品牌" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.brand} onChange={(e) => setSkuForm({ ...skuForm, brand: e.target.value })} />
              <input type="text" placeholder="计量单位 (个/箱/套等)" className="w-full px-3 py-2 border rounded-lg text-xs" value={skuForm.unit} onChange={(e) => setSkuForm({ ...skuForm, unit: e.target.value })} />
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

      {(isAddingCustomer || editingCustomer) && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-3 overflow-y-auto max-h-[90vh]">
            <h3 className="font-bold text-slate-800 text-base">{isAddingCustomer ? '登记新客户' : '修改客户档案'}</h3>
            <div className="space-y-3">
              <input type="text" placeholder="客户名称" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.name} onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value, company: e.target.value })} />
              <input type="text" placeholder="纳税人识别号/税号" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.taxId} onChange={(e) => setCustomerForm({ ...customerForm, taxId: e.target.value })} />
              <input type="text" placeholder="注册/通信地址" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.address} onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })} />
              <input type="text" placeholder="联系人" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.contact} onChange={(e) => setCustomerForm({ ...customerForm, contact: e.target.value })} />
              <input type="text" placeholder="开户银行" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.bank} onChange={(e) => setCustomerForm({ ...customerForm, bank: e.target.value })} />
              <input type="text" placeholder="银行账号" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.account} onChange={(e) => setCustomerForm({ ...customerForm, account: e.target.value })} />
              <input type="text" placeholder="联系人电话" className="w-full px-3 py-2 border rounded-lg text-xs" value={customerForm.phone} onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })} />
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

      {viewingExclusivePrice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 flex flex-col max-h-[85vh]">
            <h3 className="font-bold text-slate-800 text-sm">🔑 {viewingExclusivePrice.name} - 专属货品价格</h3>
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
                              return { ...c, exclusivePrices: { ...c.exclusivePrices, [s.id]: val } };
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
            <button onClick={() => setViewingExclusivePrice(null)} className="w-full bg-red-600 text-white py-2.5 rounded-xl text-xs font-semibold">确认关闭</button>
          </div>
        </div>
      )}

      {currentModal && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto p-4 flex flex-col">
          <div className="no-print bg-slate-100 p-4 rounded-xl space-y-3 mb-6">
            <h3 className="font-bold text-slate-800 text-xs">⚙️ 开单控制器</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <label className="block text-[10px] text-slate-500">本方公司</label>
                <input type="text" className="w-full p-2 border rounded" value={docMeta.ourCompany} onChange={(e) => setDocMeta({...docMeta, ourCompany: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500">目标客户</label>
                <select className="w-full p-2 border rounded" value={docMeta.selectedCustomerId} onChange={(e) => setDocMeta({...docMeta, selectedCustomerId: e.target.value})}>
                  <option value="">-- 请选择 --</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-between items-center text-xs">
              <button onClick={() => {
                const updatedItems = [...docMeta.items, { skuName: '', brand: '通用', unit: '个', qty: 1, unitPrice: 0, amount: 0, remarks: '' }];
                setDocMeta({...docMeta, items: updatedItems});
              }} className="bg-red-600 text-white py-1 px-3 rounded text-[10px]">+ 添加物料</button>
              <div className="flex gap-2">
                <button onClick={() => setCurrentModal(null)} className="bg-slate-300 px-3 py-1 rounded text-[10px]">退出</button>
                <button onClick={saveFormAndTriggerUpdates} className="bg-emerald-600 text-white px-3 py-1 rounded text-[10px]">保存并同步更新</button>
                <button onClick={() => window.print()} className="bg-sky-600 text-white px-3 py-1 rounded text-[10px]">🖨️ 打印单据</button>
              </div>
            </div>
          </div>

          <div className="flex-1 border p-6 bg-white shadow-inner text-slate-900 rounded-lg max-w-4xl mx-auto w-full">
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
                      <th className="p-2">货品/服务</th>
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
                        <td className="p-1"><input type="text" className="w-full bg-slate-50 border-0 focus:bg-white" value={item.skuName} onChange={(e) => updateDocItemSku(idx, e.target.value)} /></td>
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
                        <td className="p-2 border-r"><input type="text" className="w-full border-0 focus:outline-none" value={item.skuName} onChange={(e) => updateDocItemSku(idx, e.target.value)} /></td>
                        <td className="p-2 border-r"><input type="text" className="w-full border-0 focus:outline-none" value={item.brand} onChange={(e) => { const its = [...docMeta.items]; its[idx].brand = e.target.value; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 border-r text-center"><input type="number" className="w-12 border-0 text-center focus:outline-none" value={item.qty} onChange={(e) => { const its = [...docMeta.items]; its[idx].qty = parseInt(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 border-r text-right"><input type="number" className="w-16 border-0 text-right focus:outline-none" value={item.unitPrice} onChange={(e) => { const its = [...docMeta.items]; its[idx].unitPrice = parseFloat(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 text-right font-bold">¥{(item.amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-right text-sm font-black text-red-600">最终总额: ¥{docMeta.items.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}</div>
              </div>
            )}

            {(currentModal === 'contract-general' || currentModal === 'contract-special') && (
              <div className="space-y-6 text-xs text-slate-800 leading-relaxed">
                <div className="text-center">
                  <h1 className="text-xl font-bold">物资采购合同（{currentModal === 'contract-special' ? '增值税专票13%' : '普通发票'}）</h1>
                </div>
                <div>
                  <p><strong>买方 (甲方)：</strong>{customers.find(c => c.id === docMeta.selectedCustomerId)?.name || '未选择客户'}</p>
                  <p><strong>卖方 (乙方)：</strong>{docMeta.ourCompany}</p>
                </div>
                <table className="w-full text-[10px] text-left border border-slate-300">
                  <thead className="bg-slate-100 border-b border-slate-300">
                    <tr>
                      <th className="p-2 border-r">货物名称</th>
                      <th className="p-2 border-r">品牌</th>
                      <th className="p-2 border-r">单位</th>
                      <th className="p-2 border-r text-center">数量</th>
                      <th className="p-2 border-r text-right">单价</th>
                      <th className="p-2 text-right">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {docMeta.items.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 border-r"><input type="text" className="w-full border-0 focus:outline-none" value={item.skuName} onChange={(e) => updateDocItemSku(idx, e.target.value)} /></td>
                        <td className="p-2 border-r"><input type="text" className="w-full border-0 focus:outline-none" value={item.brand} onChange={(e) => { const its = [...docMeta.items]; its[idx].brand = e.target.value; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 border-r"><input type="text" className="w-full border-0 focus:outline-none" value={item.unit} onChange={(e) => { const its = [...docMeta.items]; its[idx].unit = e.target.value; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 border-r text-center"><input type="number" className="w-10 border-0 text-center" value={item.qty} onChange={(e) => { const its = [...docMeta.items]; its[idx].qty = parseInt(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 border-r text-right"><input type="number" className="w-14 border-0 text-right" value={item.unitPrice} onChange={(e) => { const its = [...docMeta.items]; its[idx].unitPrice = parseFloat(e.target.value) || 0; its[idx].amount = its[idx].qty * its[idx].unitPrice; setDocMeta({...docMeta, items: its}); }} /></td>
                        <td className="p-2 text-right font-semibold">¥{(item.amount || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-right font-medium">
                  <div>合同总额：¥{docMeta.items.reduce((sum, item) => sum + (item.amount || 0), 0).toFixed(2)}</div>
                  {currentModal === 'contract-special' && <div className="text-[10px] text-slate-500">含 13% 专票税额</div>}
                </div>
                <div className="grid grid-cols-2 gap-4 border-t pt-4 text-[10px] leading-relaxed">
                  <div className="space-y-1 border-r pr-2">
                    <p className="font-bold">甲方 (买方)：</p>
                    <p>税号：{customers.find(c => c.id === docMeta.selectedCustomerId)?.taxId || '-'}</p>
                    <p>账号：{customers.find(c => c.id === docMeta.selectedCustomerId)?.account || '-'}</p>
                  </div>
                  <div className="space-y-1 pl-2">
                    <p className="font-bold">乙方 (卖方)：</p>
                    <p>公司：{docMeta.ourCompany}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <footer className="no-print fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-slate-200 z-40 flex h-16">
        <button onClick={() => setActiveTab('home')} className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'home' ? 'text-red-600' : 'text-slate-400'}`}>
          <span className="text-xl">🏠</span>
          <span className="text-[10px] mt-0.5">首页</span>
        </button>
        <button onClick={() => setActiveTab('products')} className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'products' ? 'text-red-600' : 'text-slate-400'}`}>
          <span className="text-xl">📦</span>
          <span className="text-[10px] mt-0.5">商品</span>
        </button>
        <button onClick={() => setActiveTab('customers')} className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'customers' ? 'text-red-600' : 'text-slate-400'}`}>
          <span className="text-xl">👥</span>
          <span className="text-[10px] mt-0.5">客户</span>
        </button>
        <button onClick={() => setActiveTab('profile')} className={`flex-1 flex flex-col items-center justify-center ${activeTab === 'profile' ? 'text-red-600' : 'text-slate-400'}`}>
          <span className="text-xl">⚙️</span>
          <span className="text-[10px] mt-0.5">我的</span>
        </button>
      </footer>
    </div>
  );
}