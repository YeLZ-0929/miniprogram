// cloudfunctions/getStats/index.js - 统计查询云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;
const $ = db.command.aggregate;

exports.main = async (event, context) => {
  const { action, bookId, year, month } = event;
  const { OPENID } = cloud.getWXContext();

  // 验证用户是账本成员
  const { data: memberCheck } = await db.collection('book_members')
    .where({ bookId, _openid: OPENID })
    .get();
  if (memberCheck.length === 0) {
    return { code: 3, msg: '无权限访问此账本' };
  }

  switch (action) {
    case 'monthSummary':
      return monthSummary(bookId, year, month);
    case 'fullStats':
      return fullStats(bookId, year, month);
    case 'getBills':
      return getBills(event);
    case 'searchBills':
      return searchBills(event);
    case 'getBillById':
      return getBillById(event);
    case 'updateBill':
      return updateBillById(event, OPENID);
    case 'deleteBill':
      return deleteBillById(event, OPENID);
    default:
      return { code: -1, msg: '未知操作' };
  }
};

// 月度汇总（首页用）
async function monthSummary(bookId, year, month) {
  const { start, end } = monthRange(year, month);
  const { data } = await db.collection('bills')
    .where({
      bookId,
      date: _.gte(start).and(_.lte(end)),
    })
    .get();

  let expense = 0, income = 0;
  data.forEach(b => {
    if (b.type === 'expense') expense += b.amount;
    else income += b.amount;
  });

  return { code: 0, data: { expense, income, net: income - expense } };
}

// 完整统计（统计页用）
async function fullStats(bookId, year, month) {
  const { start, end } = monthRange(year, month);

  const { data: bills } = await db.collection('bills')
    .where({
      bookId,
      date: _.gte(start).and(_.lte(end)),
    })
    .get();

  // 汇总收支
  let totalExpense = 0, totalIncome = 0;
  const catMap = {};     // 分类统计
  const memberMap = {};  // 成员统计

  bills.forEach(b => {
    if (b.type === 'expense') totalExpense += b.amount;
    else totalIncome += b.amount;

    // 分类统计（只统计支出）
    if (b.type === 'expense') {
      const key = b.categoryId || 'other_expense';
      if (!catMap[key]) catMap[key] = { categoryId: key, total: 0, count: 0 };
      catMap[key].total += b.amount;
      catMap[key].count += 1;
    }

    // 成员统计
    const uid = b._openid;
    if (!memberMap[uid]) {
      memberMap[uid] = {
        openid: uid,
        nickName: b.nickName || '',
        avatarUrl: b.avatarUrl || '',
        expense: 0,
        income: 0,
        count: 0,
      };
    }
    if (b.type === 'expense') memberMap[uid].expense += b.amount;
    else memberMap[uid].income += b.amount;
    memberMap[uid].count += 1;
  });

  // 近6个月趋势
  const trend = await getTrend(bookId, year, month, 6);

  // 从 users 集合获取成员昵称，确保统计显示正确名称
  const memberOpenids = Object.keys(memberMap);
  let userMap = {};
  if (memberOpenids.length > 0) {
    const { data: users } = await db.collection('users')
      .where({ _openid: _.in(memberOpenids) })
      .get();
    users.forEach(u => {
      userMap[u._openid] = { nickName: u.nickName || '', displayName: u.displayName || '', avatarUrl: u.avatarUrl || '' };
    });
  }

  // 补全成员昵称（优先用 users 表数据，其次用账单记录中的）
  const membersResult = Object.values(memberMap).map(m => {
    if (userMap[m.openid]) {
      m.nickName = userMap[m.openid].nickName || m.nickName;
      m.displayName = userMap[m.openid].displayName || '';
      m.avatarUrl = userMap[m.openid].avatarUrl || m.avatarUrl;
    }
    return m;
  });

  return {
    code: 0,
    data: {
      expense: totalExpense,
      income: totalIncome,
      categories: Object.values(catMap),
      members: membersResult,
      trend,
    },
  };
}

// 近N个月趋势
async function getTrend(bookId, year, month, n) {
  const results = [];
  let y = year, m = month;

  for (let i = 0; i < n; i++) {
    const { start, end } = monthRange(y, m);
    const { data } = await db.collection('bills')
      .where({ bookId, date: _.gte(start).and(_.lte(end)) })
      .get();

    let exp = 0, inc = 0;
    data.forEach(b => {
      if (b.type === 'expense') exp += b.amount;
      else inc += b.amount;
    });

    results.unshift({ year: y, month: m, expense: exp, income: inc });

    m--;
    if (m < 1) { m = 12; y--; }
  }

  return results;
}

// 搜索账单（支持关键词+高级筛选，绕过小程序端权限限制）
// 查单条账单
async function getBillById({ billId }) {
  if (!billId) return { code: 1, msg: '参数缺失' };
  const { data } = await db.collection('bills').doc(billId).get();
  return { code: 0, data };
}

// 更新账单（仅本人可修改）
async function updateBillById({ billId, updateData }, openid) {
  if (!billId) return { code: 1, msg: '参数缺失' };
  // 校验是账单所有者
  const { data: bill } = await db.collection('bills').doc(billId).get();
  if (bill._openid !== openid) return { code: 3, msg: '只能编辑自己的账单' };
  await db.collection('bills').doc(billId).update({
    data: { ...updateData, updatedAt: db.serverDate() },
  });
  return { code: 0 };
}

// 删除账单（仅本人可删除）
async function deleteBillById({ billId }, openid) {
  if (!billId) return { code: 1, msg: '参数缺失' };
  const { data: bill } = await db.collection('bills').doc(billId).get();
  if (bill._openid !== openid) return { code: 3, msg: '只能删除自己的账单' };
  await db.collection('bills').doc(billId).remove();
  return { code: 0 };
}

async function searchBills({ bookId, selectedType, selectedCatId, minAmount, maxAmount, startDate, endDate }) {
  let whereClause = { bookId };
  if (selectedType && selectedType !== 'all') whereClause.type = selectedType;
  if (selectedCatId) whereClause.categoryId = selectedCatId;

  if (startDate && endDate) whereClause.date = _.gte(startDate).and(_.lte(endDate));
  else if (startDate) whereClause.date = _.gte(startDate);
  else if (endDate) whereClause.date = _.lte(endDate);

  if (minAmount && maxAmount) whereClause.amount = _.gte(parseFloat(minAmount)).and(_.lte(parseFloat(maxAmount)));
  else if (minAmount) whereClause.amount = _.gte(parseFloat(minAmount));
  else if (maxAmount) whereClause.amount = _.lte(parseFloat(maxAmount));

  const { data } = await db.collection('bills')
    .where(whereClause)
    .orderBy('date', 'desc')
    .orderBy('createdAt', 'desc')
    .limit(200)
    .get();

  return { code: 0, data };
}

// 获取账单列表（供前端调用，绕过小程序端权限限制）
async function getBills({ bookId, startDate, endDate, type, categoryId, memberOpenid, page = 1, pageSize = 30 }) {
  let whereClause = { bookId };
  if (startDate && endDate) whereClause.date = _.gte(startDate).and(_.lte(endDate));
  else if (startDate) whereClause.date = _.gte(startDate);
  else if (endDate) whereClause.date = _.lte(endDate);
  if (type) whereClause.type = type;
  if (categoryId) whereClause.categoryId = categoryId;
  if (memberOpenid) whereClause._openid = memberOpenid;

  const { data } = await db.collection('bills')
    .where(whereClause)
    .orderBy('date', 'desc')
    .orderBy('createdAt', 'desc')
    .skip((page - 1) * pageSize)
    .limit(pageSize)
    .get();

  return { code: 0, data };
}

// 生成月份范围字符串
function monthRange(year, month) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}
