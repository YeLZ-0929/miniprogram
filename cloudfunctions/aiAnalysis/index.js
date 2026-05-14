// cloudfunctions/aiAnalysis/index.js - AI账单分析云函数
const cloud = require('wx-server-sdk');
const fetch = require('node-fetch');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// DeepSeek 配置（⚠️ 部署前替换为你的真实 API Key）
const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = 'sk-381e25b7c46a4e3692c4c306419807cc';  // ← 替换

// 分类名称映射（与小程序端保持一致）
const CATEGORY_MAP = {
  meal: '三餐', food: '食品', daily: '日用', transport: '交通',
  leisure: '休闲', medical: '医疗', education: '教育', clothing: '服饰',
  social: '人情', housing: '住房', other_expense: '其他支出',
  salary: '工资', part_time: '兼职', investment: '理财', other_income: '其他收入',
};

exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();

  switch (action) {
    case 'monthlySummary':
      return monthlySummary(event, OPENID);
    case 'freeChat':
      return freeChat(event, OPENID);
    default:
      return { code: -1, msg: '未知操作' };
  }
};

// ===== 月度消费总结 =====
async function monthlySummary(event, openid) {
  const { bookId, year, month } = event;

  if (!bookId || !year || !month) {
    return { code: 1, msg: '参数不完整' };
  }

  // 验证权限
  const { data: memberCheck } = await db.collection('book_members')
    .where({ bookId, _openid: openid })
    .get();
  if (memberCheck.length === 0) {
    return { code: 3, msg: '无权限' };
  }

  // 查当月账单
  const { start, end } = monthRange(year, month);
  const { data: bills } = await db.collection('bills')
    .where({ bookId, date: _.gte(start).and(_.lte(end)) })
    .orderBy('date', 'desc')
    .limit(500)
    .get();

  // 查上月账单（用于对比）
  let prevMonth = month - 1, prevYear = year;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  const { start: prevStart, end: prevEnd } = monthRange(prevYear, prevMonth);
  const { data: prevBills } = await db.collection('bills')
    .where({ bookId, date: _.gte(prevStart).and(_.lte(prevEnd)) })
    .limit(500)
    .get();

  if (bills.length === 0) {
    return { code: 0, msg: '本月暂无账单记录', analysis: '本月还没有记录任何账单，开始记账后我可以帮你分析消费情况。' };
  }

  // 构建数据摘要
  const summary = buildBillSummary(bills, year, month);
  const prevSummary = buildBillSummary(prevBills, prevYear, prevMonth);

  // 构建 prompt
  const prompt = buildSummaryPrompt(summary, prevSummary, year, month);

  // 调用 DeepSeek
  try {
    const analysis = await callDeepSeek(prompt);
    return { code: 0, analysis };
  } catch (e) {
    console.error('DeepSeek 调用失败:', e.message);
    return { code: 2, msg: 'AI 分析服务暂时不可用', error: e.message };
  }
}

// ===== 自由问答 =====
async function freeChat(event, openid) {
  const { bookId, year, month, question, history } = event;

  if (!bookId || !question) {
    return { code: 1, msg: '参数不完整' };
  }

  // 验证权限
  const { data: memberCheck } = await db.collection('book_members')
    .where({ bookId, _openid: openid })
    .get();
  if (memberCheck.length === 0) {
    return { code: 3, msg: '无权限' };
  }

  // 查询账单数据（默认当月，最多查近3个月）
  const now = new Date();
  const queryYear = year || now.getFullYear();
  const queryMonth = month || now.getMonth() + 1;
  const { start, end } = monthRange(queryYear, queryMonth);
  const { data: bills } = await db.collection('bills')
    .where({ bookId, date: _.gte(start).and(_.lte(end)) })
    .limit(500)
    .get();

  const summary = buildBillSummary(bills, queryYear, queryMonth);

  // 构建 messages
  const systemPrompt = buildChatSystemPrompt(summary, queryYear, queryMonth);
  const messages = [
    { role: 'system', content: systemPrompt },
  ];

  // 添加历史对话（最近5轮）
  const recentHistory = (history || []).slice(-10);
  recentHistory.forEach(h => {
    messages.push({ role: h.role, content: h.content });
  });

  // 添加当前问题
  messages.push({ role: 'user', content: question });

  try {
    const reply = await callDeepSeekMessages(messages);
    return { code: 0, reply };
  } catch (e) {
    console.error('DeepSeek 调用失败:', e.message);
    return { code: 2, msg: 'AI 分析服务暂时不可用', error: e.message };
  }
}

// ===== 构建账单数据摘要 =====
function buildBillSummary(bills, year, month) {
  let totalExpense = 0, totalIncome = 0;
  const catMap = {};
  const dailyMap = {};  // 每日支出
  const billList = [];  // 完整账单列表（摘要版）

  bills.forEach(b => {
    const amount = Number(b.amount) || 0;
    if (b.type === 'expense') {
      totalExpense += amount;
    } else {
      totalIncome += amount;
    }

    // 分类汇总
    const catId = b.categoryId || 'other_expense';
    const catName = CATEGORY_MAP[catId] || catId;
    if (!catMap[catId]) catMap[catId] = { categoryId: catId, name: catName, total: 0, count: 0 };
    catMap[catId].total += amount;
    catMap[catId].count += 1;

    // 每日汇总
    const date = b.date || '';
    if (!dailyMap[date]) dailyMap[date] = { date, expense: 0, income: 0, count: 0 };
    if (b.type === 'expense') dailyMap[date].expense += amount;
    else dailyMap[date].income += amount;
    dailyMap[date].count += 1;

    // 账单列表（精简）
    billList.push({
      date,
      type: b.type,
      amount,
      categoryName: catName,
      note: b.note || '',
    });
  });

  // 排序分类
  const categories = Object.values(catMap)
    .sort((a, b) => b.total - a.total)
    .map(c => ({
      ...c,
      percent: totalExpense > 0 && c.categoryId !== 'salary' && c.categoryId !== 'part_time' && c.categoryId !== 'investment' && c.categoryId !== 'other_income'
        ? Math.round((c.total / totalExpense) * 100) : 0,
    }));

  return {
    year, month,
    totalExpense: Math.round(totalExpense * 100) / 100,
    totalIncome: Math.round(totalIncome * 100) / 100,
    net: Math.round((totalIncome - totalExpense) * 100) / 100,
    billCount: bills.length,
    categories,
    daily: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
    billList,
  };
}

// ===== 构建月度总结 Prompt =====
function buildSummaryPrompt(cur, prev, year, month) {
  const curExpenseCats = cur.categories
    .filter(c => c.total > 0)
    .map(c => `  - ${c.name}: ¥${c.total.toFixed(2)} (${c.count}笔, 占${c.percent}%)`)
    .join('\n');

  const prevExpenseText = prev.totalExpense > 0
    ? `上月总支出 ¥${prev.totalExpense.toFixed(2)}，总收入 ¥${prev.totalIncome.toFixed(2)}`
    : '上月无数据';

  // 计算环比变化
  let changeText = '';
  if (prev.totalExpense > 0) {
    const expChange = ((cur.totalExpense - prev.totalExpense) / prev.totalExpense * 100).toFixed(1);
    changeText = `支出环比${expChange > 0 ? '增加' : '减少'} ${Math.abs(expChange)}%`;
  }

  // Top 3 消费日
  const topDays = [...cur.daily].sort((a, b) => b.expense - a.expense).slice(0, 3);
  const topDaysText = topDays.map(d => `${d.date} (¥${d.expense.toFixed(2)})`).join('、');

  return `你是一位专业的家庭财务顾问，请根据以下账单数据，给出一份简洁、友好、有洞察力的月度消费分析报告。

## ${year}年${month}月 账单数据

**总览：**
- 总支出: ¥${cur.totalExpense.toFixed(2)} (${cur.billCount}笔)
- 总收入: ¥${cur.totalIncome.toFixed(2)}
- 结余: ¥${cur.net.toFixed(2)}
- ${changeText || '无上月数据对比'}

**支出分类明细：**
${curExpenseCats || '  暂无支出'}

**对比：**
- ${prevExpenseText}
- 消费最多的日期: ${topDaysText || '无'}

**部分账单详情：**
${cur.billList.slice(0, 30).map(b => `  ${b.date} [${b.type === 'expense' ? '支' : '收'}] ${b.categoryName} ¥${b.amount.toFixed(2)}${b.note ? ' (' + b.note + ')' : ''}`).join('\n')}

## 分析要求

请按以下结构输出分析报告（使用 Markdown 格式）：

1. **一句话总结**：用一句话概括本月消费情况
2. **消费洞察**（2-3条）：发现值得关注的花费趋势或异常，如某类消费突然升高、是否有不必要的开支
3. **分类点评**：对前3大支出类别给出简短评价
4. **改善建议**（2-3条）：具体、可执行的省钱或理财建议，给出预估可省金额
5. **积极方面**：表扬做得好的地方（如某类消费控制得好）

注意：
- 语气亲切自然，像朋友聊天，不用太正式
- 金额用中文大写单位（如"8500元"而不是"¥8500.00"）
- 建议要具体可执行，不要说空话
- 如果数据太少（少于5笔），分析要更谨慎`;
}

// ===== 构建自由问答 System Prompt =====
function buildChatSystemPrompt(summary, year, month) {
  const catText = summary.categories
    .filter(c => c.total > 0)
    .map(c => `${c.name}: ¥${c.total.toFixed(2)} (${c.count}笔, 占${c.percent}%)`)
    .join('；');

  return `你是一位贴心的家庭财务助手。用户在和你讨论他们的账单数据。

以下是 ${year}年${month}月 的账单统计：
- 总支出: ¥${summary.totalExpense.toFixed(2)}（共${summary.billCount}笔）
- 总收入: ¥${summary.totalIncome.toFixed(2)}
- 结余: ¥${summary.net.toFixed(2)}
- 支出分类: ${catText}

所有分类说明：
- 三餐: 外卖、堂食、早餐等
- 食品: 超市采购、水果零食等
- 交通: 地铁公交打车等
- 休闲: 电影游戏运动旅游
- 人情: 红包礼物聚餐
- 住房: 房租水电燃气物业
- 日用: 清洁个护厨房用品
- 医疗: 药品就医体检
- 教育: 课程书籍文具
- 服饰: 衣服鞋配饰

回答要求：
1. 语气亲切自然，像朋友聊天
2. 金额用中文单位（如"8500元"）
3. 如果用户问的数据不在统计范围内，诚实说明
4. 建议要具体可执行
5. 回答简洁，不要太长`;
}

// ===== 调用 DeepSeek API =====
async function callDeepSeek(prompt) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1500,
    }),
    timeout: 30000,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callDeepSeekMessages(messages) {
  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    }),
    timeout: 30000,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`DeepSeek API ${response.status}: ${errText}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

// ===== 工具函数 =====
function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
