// cloudfunctions/manageBook/index.js - 账本管理云函数
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { action } = event;
  const { OPENID } = cloud.getWXContext();

  switch (action) {
    case 'checkLogin':
      return { openid: OPENID };

    case 'upsertUser':
      return upsertUser(OPENID, event.userInfo);

    case 'joinByCode':
      return joinByCode(event.inviteCode, OPENID);

    case 'getMembers':
      return getMembers(event.bookId, OPENID);

    case 'removeMember':
      return removeMember(event.bookId, event.targetOpenid, OPENID);

    default:
      return { code: -1, msg: '未知操作' };
  }
};

// 通过邀请码加入账本
async function joinByCode(inviteCode, openid) {
  if (!inviteCode || inviteCode.length !== 6) {
    return { code: 1, msg: '邀请码格式错误' };
  }

  // 查找账本
  const { data: books } = await db.collection('books')
    .where({ inviteCode: inviteCode.toUpperCase() })
    .get();

  if (books.length === 0) {
    return { code: 2, msg: '邀请码无效，请确认后重试' };
  }
  const book = books[0];

  // 检查是否已加入
  const { data: existing } = await db.collection('book_members')
    .where({ bookId: book._id, _openid: openid })
    .get();

  if (existing.length > 0) {
    return { code: 0, msg: '已在该账本中', book };
  }

  // 加入账本
  await db.collection('book_members').add({
    data: {
      bookId: book._id,
      _openid: openid,
      role: 'member',
      joinedAt: db.serverDate(),
    },
  });

  return { code: 0, book };
}

// 获取或创建用户（通过云函数的 OPENID 精确匹配，避免客户端 {openid} 查询不可靠的问题）
async function upsertUser(openid, userInfo) {
  if (!openid) return { code: -1, msg: '无法获取用户标识' };

  // 1. 优先通过 _openid 精确匹配
  let { data } = await db.collection('users')
    .where({ _openid: openid })
    .get();

  // 2. 如果没找到，尝试查找没有 _openid 但 nickName/avatarUrl 匹配的脏数据记录
  if (data.length === 0 && userInfo.nickName) {
    const { data: orphanUsers } = await db.collection('users')
      .where({
        _openid: _.exists(false),
        nickName: userInfo.nickName,
      })
      .limit(5)
      .get();

    if (orphanUsers.length > 0) {
      console.warn('[upsertUser] 发现无 _openid 的孤儿记录，修复中...', openid);
      // 给第一条补上 _openid，其余的删除
      for (let i = 0; i < orphanUsers.length; i++) {
        if (i === 0) {
          try {
            await db.collection('users').doc(orphanUsers[i]._id).update({
              data: { _openid: openid, updatedAt: db.serverDate() },
            });
          } catch (e) {
            console.error('修复孤儿记录失败:', e);
          }
        } else {
          try {
            await db.collection('users').doc(orphanUsers[i]._id).remove();
          } catch (e) {
            console.error('删除重复孤儿记录失败:', e);
          }
        }
      }
      // 重新查询
      const { data: refetched } = await db.collection('users')
        .where({ _openid: openid })
        .get();
      data = refetched;
    }
  }

  if (data.length > 0) {
    // 存在多条记录（脏数据）：清理重复，只保留第一条
    if (data.length > 1) {
      console.warn('[upsertUser] 发现重复用户记录，清理中...', openid);
      for (let i = 1; i < data.length; i++) {
        try {
          await db.collection('users').doc(data[i]._id).remove();
        } catch (e) {
          console.error('删除重复记录失败:', e);
        }
      }
    }

    // 更新已有记录
    const updateData = {
      nickName: userInfo.nickName || data[0].nickName,
      avatarUrl: userInfo.avatarUrl || data[0].avatarUrl,
      updatedAt: db.serverDate(),
    };
    if (userInfo.displayName !== undefined && userInfo.displayName !== null) {
      updateData.displayName = userInfo.displayName;
    }
    await db.collection('users').doc(data[0]._id).update({ data: updateData });
    return { code: 0, data: { ...data[0], ...updateData } };
  }

  // 首次登录：创建用户
  const res = await db.collection('users').add({
    data: {
      _openid: openid,
      nickName: userInfo.nickName || '',
      avatarUrl: userInfo.avatarUrl || '',
      displayName: userInfo.displayName || '',
      createdAt: db.serverDate(),
      updatedAt: db.serverDate(),
    },
  });
  return { code: 0, data: { _id: res._id, ...userInfo } };
}

// 获取账本成员列表
async function getMembers(bookId, openid) {
  // 验证请求者是账本成员
  const { data: self } = await db.collection('book_members')
    .where({ bookId, _openid: openid })
    .get();
  if (self.length === 0) return { code: 3, msg: '无权限' };

  const { data: members } = await db.collection('book_members')
    .where({ bookId })
    .get();

  // 获取每个成员的用户信息
  const openids = members.map(m => m._openid).filter(Boolean);
  let users = [];
  
  if (openids.length > 0) {
    try {
      const userRes = await db.collection('users')
        .where({ _openid: _.in(openids) })
        .get();
      users = userRes.data || [];
    } catch (e) {
      console.log('查询users失败:', e);
    }
  }

  const result = members.map(m => {
    const u = users.find(u => u._openid === m._openid) || {};
    
    // 格式化加入日期
    let joinedAtStr = '未知时间';
    if (m.joinedAt) {
      const date = new Date(m.joinedAt);
      if (!isNaN(date.getTime())) {
        const y = date.getFullYear();
        const mo = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        joinedAtStr = `${y}-${mo}-${d}`;
      }
    }
    
    return {
      openid: m._openid,
      role: m.role,
      joinedAt: joinedAtStr,
      nickName: u.nickName || '微信用户',
      displayName: u.displayName || '',
      avatarUrl: u.avatarUrl || '',
    };
  });

  return { code: 0, data: result };
}

// 移除成员（仅管理员可操作）
async function removeMember(bookId, targetOpenid, openid) {
  const { data: self } = await db.collection('book_members')
    .where({ bookId, _openid: openid, role: 'admin' })
    .get();
  if (self.length === 0) return { code: 3, msg: '仅管理员可移除成员' };
  if (targetOpenid === openid) return { code: 4, msg: '不能移除自己' };

  await db.collection('book_members')
    .where({ bookId, _openid: targetOpenid })
    .remove();

  return { code: 0 };
}
