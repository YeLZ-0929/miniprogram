// cloudfunctions/ocrReceipt/index.js - OCR识别云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const KEYWORD_MAP = {
  '早饭': 'meal', '午饭': 'meal', '晚饭': 'meal', '外卖': 'meal',
  '超市': 'food', '便利店': 'food', '生鲜': 'food',
  '出行': 'transport', '滴滴': 'transport', '地铁': 'transport',
  '药店': 'medical', '医院': 'medical',
  '书城': 'education', '文具': 'education',
};

exports.main = async (event, context) => {
  const { fileID } = event;
  if (!fileID) return { code: 1, msg: '缺少文件ID' };

  try {
    // 获取临时下载链接
    const { fileList } = await cloud.getTempFileURL({ fileList: [fileID] });
    const imageUrl = fileList[0]?.tempFileURL;
    if (!imageUrl) return { code: 2, msg: '获取图片地址失败' };

    // 调用腾讯云 OCR（通用+票据）
    const ocrResult = await callTencentOCR(imageUrl);

    // 解析OCR结果
    const parsed = parseOCRResult(ocrResult);

    // 清理临时文件
    cloud.deleteFile({ fileList: [fileID] }).catch(() => {});

    return { code: 0, data: parsed };
  } catch (e) {
    return { code: -1, msg: 'OCR识别失败', error: e.message };
  }
};

/**
 * 调用腾讯云通用印刷体OCR
 */
async function callTencentOCR(imageUrl) {
  const tencentcloud = require('tencentcloud-sdk-nodejs');
  const OcrClient = tencentcloud.ocr.v20181119.Client;

  const clientConfig = {
    credential: {
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    },
    region: 'ap-guangzhou',
  };

  const client = new OcrClient(clientConfig);

  // 先尝试票据OCR
  try {
    const res = await client.RecognizeGeneralInvoice({
      ImageUrl: imageUrl,
      EnableMultiplePage: false,
    });
    return { type: 'invoice', data: res };
  } catch (e) {
    // 降级到通用OCR
    const res = await client.GeneralBasicOCR({ ImageUrl: imageUrl });
    return { type: 'general', data: res };
  }
}

/**
 * 解析OCR结果，提取金额、日期、商家名等
 */
function parseOCRResult(ocrResult) {
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  let allText = '';
  let amount = 0;
  let date = todayStr;
  let merchant = '';

  if (ocrResult.type === 'general') {
    // 通用OCR：拼接所有识别文字
    allText = (ocrResult.data.TextDetections || [])
      .map(t => t.DetectedText)
      .join(' ');
  } else {
    // 票据OCR
    allText = JSON.stringify(ocrResult.data);
  }

  // 提取金额（取最大金额作为总金额）
  const amountMatches = allText.match(/[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*[元]?/g) || [];
  const amounts = amountMatches
    .map(m => parseFloat(m.replace(/[¥￥元\s]/g, '')))
    .filter(n => !isNaN(n) && n > 0 && n < 100000);

  if (amounts.length > 0) {
    amount = Math.max(...amounts);
  }

  // 提取日期
  const dateMatch = allText.match(/(\d{4})[年\-\/](\d{1,2})[月\-\/](\d{1,2})/);
  if (dateMatch) {
    date = `${dateMatch[1]}-${String(dateMatch[2]).padStart(2,'0')}-${String(dateMatch[3]).padStart(2,'0')}`;
  }

  // 提取商家/备注（取第一行非金额文字）
  const lines = allText.split(/[\n\s]+/).filter(l => l.length > 1 && !/^\d/.test(l));
  merchant = lines.slice(0, 2).join(' ').slice(0, 20);

  // 匹配分类
  let categoryId = 'other_expense';
  for (const [kw, catId] of Object.entries(KEYWORD_MAP)) {
    if (allText.includes(kw)) {
      categoryId = catId;
      break;
    }
  }

  return {
    amount,
    type: 'expense',
    categoryId,
    date,
    note: merchant,
    rawText: allText.slice(0, 200),
  };
}
