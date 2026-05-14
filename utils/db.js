// utils/db.js - 数据库操作封装

const db = wx.cloud.database();
const _ = db.command;

// ===================== 集合名称 =====================
const COL = {
  USERS: 'users',
  BOOKS: 'books',
  MEMBERS: 'book_members',
  BILLS: 'bills',
};

// ===================== 用户相关 =====================

/**
 * 获取或创建当前用户记录（通过云函数，确保 OPENID 精确匹配）
 * @param {object} userInfo - { nickName, avatarUrl, displayName }
 */
const getOrCreateUser = async (userInfo) => {
  const { result } = await wx.cloud.callFunction({
    name: 'manageBook',
    data: { action: 'upsertUser', userInfo },
  });

  if (result && result.code === 0) {
    return result.data;
  }
  throw new Error(result ? result.msg : '用户操作失败');
};

/**
 * 更新用户显示昵称（通过云函数）
 * @param {string} displayName - 自定义显示昵称
 */
const updateDisplayName = async (displayName) => {
  const { result } = await wx.cloud.callFunction({
    name: 'manageBook',
    data: { action: 'upsertUser', userInfo: { displayName } },
  });
  if (result && result.code === 0) return true;
  throw new Error(result ? result.msg : '更新失败');
};

// ===================== 账本相关 =====================

/**
 * 获取用户参与的所有账本
 */
const getUserBooks = async () => {
  // 获取成员关系表中当前用户的记录
  const { data: memberRows } = await db.collection(COL.MEMBERS)
    .where({ _openid: '{openid}' })
    .orderBy('joinedAt', 'desc')
    .get();

  if (memberRows.length === 0) return [];

  const bookIds = memberRows.map(m => m.bookId);
  const { data: books } = await db.collection(COL.BOOKS)
    .where({ _id: _.in(bookIds) })
    .get();

  // 给每个账本附上当前用户的角色
  return books.map(book => {
    const member = memberRows.find(m => m.bookId === book._id);
    return { ...book, role: member ? member.role : 'member' };
  });
};

/**
 * 创建账本
 */
const createBook = async (name, icon = '📒') => {
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  const { _id } = await db.collection(COL.BOOKS).add({
    data: {
      name,
      icon,
      inviteCode,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });

  // 创建者自动加入账本，角色为 admin
  await db.collection(COL.MEMBERS).add({
    data: {
      bookId: _id,
      role: 'admin',
      joinedAt: db.serverDate(),
    },
  });

  return { _id, name, icon, inviteCode, role: 'admin' };
};

/**
 * 通过邀请码加入账本（需云函数处理权限）
 */
const joinBookByCode = async (inviteCode) => {
  return wx.cloud.callFunction({
    name: 'manageBook',
    data: { action: 'joinByCode', inviteCode },
  });
};

// ===================== 账单相关 =====================

/**
 * 新增账单
 */
const addBill = async (bill) => {
  return db.collection(COL.BILLS).add({
    data: {
      ...bill,
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
};

/**
 * 更新账单
 */
const updateBill = async (id, data) => {
  return db.collection(COL.BILLS).doc(id).update({
    data: { ...data, updatedAt: db.serverDate() },
  });
};

/**
 * 删除账单
 */
const deleteBill = async (id) => {
  return db.collection(COL.BILLS).doc(id).remove();
};

/**
 * 获取账单列表（通过云函数查询，支持读取所有成员的账单）
 * @param {object} options
 */
const getBills = async ({
  bookId,
  startDate,
  endDate,
  categoryId,
  type,         // 'expense' | 'income' | null
  memberOpenid, // 筛选成员（可选）
  page = 1,
  pageSize = 30,
}) => {
  const { result } = await wx.cloud.callFunction({
    name: 'getStats',
    data: {
      action: 'getBills',
      bookId,
      startDate,
      endDate,
      categoryId,
      type,
      memberOpenid,
      page,
      pageSize,
    },
  });

  if (result && result.code === 0) {
    return result.data;
  }
  throw new Error(result ? result.msg : '获取账单失败');
};

module.exports = {
  COL,
  getOrCreateUser,
  updateDisplayName,
  getUserBooks,
  createBook,
  joinBookByCode,
  addBill,
  updateBill,
  deleteBill,
  getBills,
};
