// cloudfunctions/parseText/index.js - AI文字识别云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

// 关键词→分类映射（与前端保持一致）
const KEYWORD_MAP = {
  '早饭': 'meal', '早餐': 'meal', '午饭': 'meal', '午餐': 'meal',
  '晚饭': 'meal', '晚餐': 'meal', '吃饭': 'meal', '外卖': 'meal', '饭': 'meal',
  '菜': 'food', '超市': 'food', '水果': 'food', '零食': 'food', '蔬菜': 'food',
  '地铁': 'transport', '公交': 'transport', '打车': 'transport', '滴滴': 'transport', '出行': 'transport',
  '电影': 'leisure', '游戏': 'leisure', '运动': 'leisure', '健身': 'leisure', '娱乐': 'leisure',
  '药': 'medical', '医院': 'medical', '看病': 'medical', '诊': 'medical',
  '书': 'education', '课': 'education', '学习': 'education', '培训': 'education',
  '衣服': 'clothing', '鞋': 'clothing', '裤子': 'clothing', '外套': 'clothing',
  '房租': 'housing', '水电': 'housing', '电费': 'housing', '燃气': 'housing', '物业': 'housing',
  '工资': 'salary', '薪资': 'salary', '奖金': 'salary',
};

const INCOME_KEYWORDS = ['工资', '薪资', '奖金', '收入', '到账', '发工资'];

/**
 * 本地规则解析（兜底方案）
 */
function parseLocally(text) {
  // 提取金额
  const amountMatch = text.match(/[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*[元块]?/);
  const amount = amountMatch ? parseFloat(amountMatch[1]) : 0;

  // 判断收入/支出
  const type = INCOME_KEYWORDS.some(kw => text.includes(kw)) ? 'income' : 'expense';

  // 匹配分类
  let categoryId = type === 'income' ? 'salary' : 'other_expense';
  for (const [kw, catId] of Object.entries(KEYWORD_MAP)) {
    if (text.includes(kw)) {
      categoryId = catId;
      break;
    }
  }

  // 日期处理
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  return { amount, type, categoryId, date: dateStr, note: text };
}

exports.main = async (event, context) => {
  const { text } = event;
  if (!text || !text.trim()) {
    return { code: 1, msg: '文本不能为空' };
  }

  try {
    // 优先调用大模型API（腾讯混元 / 其他）
    // 如果配置了 API key，则调用 AI；否则 fallback 到本地规则
    const AI_KEY = process.env.HUNYUAN_API_KEY;

    if (AI_KEY) {
      const result = await callHunyuan(text, AI_KEY);
      return { code: 0, data: result };
    } else {
      // 降级：本地规则解析
      return { code: 0, data: parseLocally(text) };
    }
  } catch (e) {
    // 任何错误都降级到本地规则
    return { code: 0, data: parseLocally(text) };
  }
};

/**
 * 调用腾讯混元API进行结构化解析
 */
async function callHunyuan(text, apiKey) {
  const https = require('https');
  const prompt = `你是一个记账助手。请从以下文本中提取记账信息，以JSON格式返回，包含字段：
- amount: 金额数字（数字，不含货币符号）
- type: "expense"（支出）或 "income"（收入）
- categoryId: 分类ID，从以下选择：meal/food/daily/transport/leisure/medical/education/clothing/housing/social/other_expense/salary/investment/other_income
- date: 日期，格式YYYY-MM-DD，如未提及则返回今天${new Date().toISOString().slice(0,10)}
- note: 简短备注

文本：${text}

只返回JSON，不要其他内容。`;

  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'hunyuan-lite',
      messages: [{ role: 'user', content: prompt }],
    });

    const options = {
      hostname: 'hunyuan.tencentcloudapi.com',
      path: '/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const resp = JSON.parse(data);
          const content = resp.choices?.[0]?.message?.content || '{}';
          const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
          resolve(JSON.parse(jsonStr));
        } catch (e) {
          resolve(parseLocally(text));
        }
      });
    });

    req.on('error', () => resolve(parseLocally(text)));
    req.write(body);
    req.end();
  });
}
