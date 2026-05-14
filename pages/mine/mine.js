// pages/mine/mine.js - 我的页面
const db = require('../../utils/db');

Page({
  data: {
    userInfo: null,
    currentBook: null,
    displayName: '',   // 自定义显示昵称
  },

  onLoad() {
    const app = getApp();
    if (!app.guardLogin()) return;
    const userInfo = app.globalData.userInfo;
    this.setData({
      userInfo,
      currentBook: app.globalData.currentBook,
      displayName: userInfo ? (userInfo.displayName || '') : '',
    });
  },

  onShow() {
    const app = getApp();
    const userInfo = app.globalData.userInfo;
    this.setData({
      currentBook: app.globalData.currentBook,
      displayName: userInfo ? (userInfo.displayName || '') : '',
    });
  },

  goBookManage() {
    wx.navigateTo({ url: '/pages/book/book' });
  },

  async exportBills() {
    wx.showToast({ title: '导出功能开发中', icon: 'none' });
  },

  // 修改显示昵称
  editNickname() {
    const { displayName, userInfo } = this.data;
    const placeholder = userInfo ? userInfo.nickName : '微信用户';
    const currentDisplay = displayName || placeholder;

    wx.showModal({
      title: '修改显示昵称',
      editable: true,
      placeholderText: '请输入昵称（清空则使用微信昵称）',
      content: currentDisplay,
      confirmText: '保存',
      confirmColor: '#4F80FF',
      success: async (res) => {
        if (res.confirm && res.content !== undefined) {
          const newDisplayName = res.content.trim();
          // 如果输入的内容和微信昵称相同，则视为清空 displayName
          const finalDisplayName = newDisplayName === userInfo.nickName ? '' : newDisplayName;

          try {
            await db.updateDisplayName(finalDisplayName);

            // 更新全局和缓存
            const app = getApp();
            if (app.globalData.userInfo) {
              app.globalData.userInfo.displayName = finalDisplayName;
            }
            wx.setStorageSync('userInfo', app.globalData.userInfo);

            this.setData({ displayName: finalDisplayName });
            wx.showToast({ title: '昵称已更新', icon: 'success' });
          } catch (e) {
            console.error('更新昵称失败:', e);
            wx.showToast({ title: '更新失败: ' + (e.message || '未知错误'), icon: 'none' });
          }
        }
      },
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.globalData.userInfo = null;
          app.globalData.currentBook = null;
          wx.removeStorageSync('userInfo');
          wx.removeStorageSync('currentBook');
          wx.redirectTo({ url: '/pages/login/login' });
        }
      },
    });
  },
});
