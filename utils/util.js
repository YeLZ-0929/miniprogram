// utils/util.js - 通用工具函数

/**
 * 格式化日期
 * @param {Date|number} date - Date对象或时间戳
 * @param {string} fmt - 格式模板，如 'YYYY-MM-DD'
 */
const formatDate = (date, fmt = 'YYYY-MM-DD') => {
  if (!date) return '';
  const d = date instanceof Date ? date : new Date(date);
  const map = {
    'YYYY': d.getFullYear(),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'DD': String(d.getDate()).padStart(2, '0'),
    'HH': String(d.getHours()).padStart(2, '0'),
    'mm': String(d.getMinutes()).padStart(2, '0'),
    'SS': String(d.getSeconds()).padStart(2, '0'),
  };
  return fmt.replace(/YYYY|MM|DD|HH|mm|SS/g, match => map[match]);
};

/**
 * 获取今日日期字符串 YYYY-MM-DD
 */
const today = () => formatDate(new Date(), 'YYYY-MM-DD');

/**
 * 获取本月起止日期
 */
const currentMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end };
};

/**
 * 格式化金额显示
 * @param {number} amount
 * @param {boolean} withSign - 是否带+/-符号
 */
const formatAmount = (amount, withSign = false) => {
  const num = Math.abs(amount);
  const str = num.toFixed(2);
  if (withSign) return amount >= 0 ? `+${str}` : `-${str}`;
  return str;
};

/**
 * 简单的本地NLP：从文本中提取金额和分类关键词
 * @param {string} text
 * @returns {{amount: number|null, keywords: string[]}}
 */
const parseTextLocally = (text) => {
  // 提取金额：支持 "35元" "35.5" "¥35" "花了35" 等格式
  const amountRegex = /[¥￥]?\s*(\d+(?:\.\d{1,2})?)\s*[元块]?/;
  const match = text.match(amountRegex);
  const amount = match ? parseFloat(match[1]) : null;

  // 提取关键词
  const keywords = text.replace(/[0-9¥￥元块.,，。！!?？]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 1);

  return { amount, keywords };
};

/**
 * 防抖
 */
const debounce = (fn, delay = 300) => {
  let timer = null;
  return function (...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
};

/**
 * 将账单列表按日期分组
 * @param {Array} bills
 * @returns {Array} [{date, bills, totalExpense, totalIncome}]
 */
const groupBillsByDate = (bills) => {
  const map = {};
  bills.forEach(bill => {
    const date = formatDate(bill.date, 'YYYY-MM-DD');
    if (!map[date]) {
      map[date] = { date, bills: [], totalExpense: 0, totalIncome: 0 };
    }
    map[date].bills.push(bill);
    if (bill.type === 'expense') {
      map[date].totalExpense += bill.amount;
    } else {
      map[date].totalIncome += bill.amount;
    }
  });

  return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
};

/**
 * 获取相对日期描述（今天/昨天/具体日期）
 */
const relativeDateText = (dateStr) => {
  const todayStr = today();
  const yesterday = formatDate(new Date(Date.now() - 86400000), 'YYYY-MM-DD');
  if (dateStr === todayStr) return '今天';
  if (dateStr === yesterday) return '昨天';
  return dateStr.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1年$2月$3日');
};

/**
 * 生成唯一ID（简版）
 */
const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

module.exports = {
  formatDate,
  today,
  currentMonthRange,
  formatAmount,
  parseTextLocally,
  debounce,
  groupBillsByDate,
  relativeDateText,
  genId,
};
