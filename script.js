const SPREADSHEET_ID = 'https://script.google.com/macros/s/AKfycbzV1Ls8bmFrUJtggUcn7zXt5lesCMPeJx2oX13em1l2-ekAx5GMT_X4KfsQ5mWynBlM/exec'; // Ganti dengan ID Spreadsheet Anda
const PO_SHEET_NAME = 'PurchaseOrders';
const WO_SHEET_NAME = 'WorkOrders';
const INV_SHEET_NAME = 'Inventory';

// Fungsi utama untuk menangani permintaan GET
function doGet(e) {
  try {
    const action = e.parameter.action;
    let result;
    console.log(`GET request received for action: ${action}`);

    if (action === 'getData') {
      result = {
        status: 'success',
        purchaseOrders: getDataFromSheet(PO_SHEET_NAME),
        workOrders: getDataFromSheet(WO_SHEET_NAME),
        inventory: getDataFromSheet(INV_SHEET_NAME)
      };
    } else {
      throw new Error("Invalid GET action");
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(`Error in doGet: ${err.message}`);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Fungsi utama untuk menangani permintaan POST
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const action = request.action;
    const data = request.data;
    let result;
    console.log(`POST request received for action: ${action}`);

    switch(action) {
      case 'addPO':
        result = addPO(data);
        break;
      case 'addWO':
        result = addWO(data);
        break;
      case 'updateWOStatus':
        result = updateWOStatus(data);
        break;
      case 'addInventory':
        result = addOrUpdateInventory(data);
        break;
      case 'deleteInventory':
        result = deleteInventory(data);
        break;
      default:
        throw new Error("Invalid POST action");
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    console.error(`Error in doPost: ${err.message}`);
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Helper untuk mendapatkan semua data dari sheet
function getDataFromSheet(sheetName) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data.shift();
  return data.map(row => {
    let obj = {};
    headers.forEach((header, i) => obj[header] = row[i]);
    return obj;
  });
}

// Fungsi Spesifik
function addPO(data) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PO_SHEET_NAME);
  const newRow = [Utilities.getUuid(), data.poNumber, data.customer, new Date(), '新規'];
  sheet.appendRow(newRow);
  return { status: 'success', message: 'PO added' };
}

function addWO(data) {
  const poSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PO_SHEET_NAME);
  const woSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(WO_SHEET_NAME);
  
  // Update PO status
  const poData = poSheet.getDataRange().getValues();
  const poHeaders = poData[0];
  const poIdIndex = poHeaders.indexOf('id');
  const poStatusIndex = poHeaders.indexOf('status');

  for (let i = 1; i < poData.length; i++) {
    if (poData[i][poIdIndex] === data.poId) {
      poSheet.getRange(i + 1, poStatusIndex + 1).setValue('処理中');
      break;
    }
  }
  
  // Add new WO
  const history = JSON.stringify([{ status: "組立工程", timestamp: new Date() }]);
  const newRow = [Utilities.getUuid(), data.woNumber, data.poNumber, '組立工程', new Date(), history];
  woSheet.appendRow(newRow);
  return { status: 'success', message: 'WO added' };
}

function updateWOStatus(data) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(WO_SHEET_NAME);
    const woData = sheet.getDataRange().getValues();
    const headers = woData[0];
    const idIndex = headers.indexOf('id');
    const statusIndex = headers.indexOf('status');
    const historyIndex = headers.indexOf('history');

    for (let i = 1; i < woData.length; i++) {
        if (woData[i][idIndex] === data.woId) {
            sheet.getRange(i + 1, statusIndex + 1).setValue(data.nextStatus);
            sheet.getRange(i + 1, historyIndex + 1).setValue(data.newHistory);
            
            // Jika sudah selesai, update PO juga
            if(data.nextStatus === '完了＆請求済み'){
                const poSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PO_SHEET_NAME);
                const poDataRange = poSheet.getDataRange().getValues();
                const poHeaders = poDataRange[0];
                const poNumberIndex = poHeaders.indexOf('poNumber');
                const poStatusIndex = poHeaders.indexOf('status');
                const woPoNumber = woData[i][headers.indexOf('poNumber')];

                for(let j = 1; j < poDataRange.length; j++){
                    if(poDataRange[j][poNumberIndex] === woPoNumber){
                        poSheet.getRange(j + 1, poStatusIndex + 1).setValue('完了＆請求済み');
                        break;
                    }
                }
            }
            break;
        }
    }
    return { status: 'success', message: 'WO status updated' };
}

function addOrUpdateInventory(data) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(INV_SHEET_NAME);
  if (data.id) { // Update
    const invData = sheet.getDataRange().getValues();
    const headers = invData[0];
    const idIndex = headers.indexOf('id');
    for (let i = 1; i < invData.length; i++) {
      if (invData[i][idIndex] === data.id) {
        sheet.getRange(i + 1, headers.indexOf('name') + 1).setValue(data.name);
        sheet.getRange(i + 1, headers.indexOf('sku') + 1).setValue(data.sku);
        sheet.getRange(i + 1, headers.indexOf('type') + 1).setValue(data.type);
        sheet.getRange(i + 1, headers.indexOf('quantity') + 1).setValue(data.quantity);
        break;
      }
    }
  } else { // Add new
    const newRow = [Utilities.getUuid(), data.name, data.sku, data.type, data.quantity];
    sheet.appendRow(newRow);
  }
  return { status: 'success', message: 'Inventory updated' };
}

function deleteInventory(data) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(INV_SHEET_NAME);
    const invData = sheet.getDataRange().getValues();
    const idIndex = invData[0].indexOf('id');
    for (let i = invData.length - 1; i > 0; i--) {
        if (invData[i][idIndex] === data.id) {
            sheet.deleteRow(i + 1);
            break;
        }
    }
    return { status: 'success', message: 'Inventory deleted' };
}

