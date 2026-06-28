// google-apps-script.js
function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    var payload = requestData.payload;
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    
    if (action === "upload") {
      sheet.clear();
      sheet.getRange(1, 1).setValue(JSON.stringify(payload));
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: "云同步备份成功！" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "未匹配到对应Action指令" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var val = sheet.getRange(1, 1).getValue();
    var data = val ? JSON.parse(val) : { skus: [], customers: [] };
    return ContentService.createTextOutput(JSON.stringify({ success: true, data: data }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}