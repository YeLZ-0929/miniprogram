// app.js - 小程序全局入口
App({
  globalData: {
    userInfo: null,
    openid: null,
    currentBook: null,   // 当前选中账本
    bookList: [],        // 用户参与的所有账本
    currentFilter: null, // 从统计页传来的筛选条件 { categoryId, memberOpenid, filterTitle }
  },

  onLaunch() {
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-d7gf65x2r8a44b4c7',   // 替换为你的云开发环境ID
        traceUser: true,
      });
    }

    // 从本地缓存恢复登录状态
    const userInfo = wx.getStorageSync('userInfo');
    const currentBook = wx.getStorageSync('currentBook');
    if (userInfo) {
      this.globalData.userInfo = userInfo;
    }
    if (currentBook) {
      this.globalData.currentBook = currentBook;
    }
  },

  // 检查登录状态，未登录跳转到登录页
  checkLogin() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'manageBook',
        data: { action: 'checkLogin' },
      }).then(res => {
        if (res.result && res.result.openid) {
          this.globalData.openid = res.result.openid;
          resolve(res.result.openid);
        } else {
          reject(new Error('未登录'));
        }
      }).catch(err => {
        reject(err);
      });
    });
  },

  // 检查是否已登录（通过缓存），未登录则跳登录页
  // 返回 true 表示已登录，false 表示未登录（已自动跳转）
  guardLogin() {
    if (!this.globalData.userInfo) {
      const cached = wx.getStorageSync('userInfo');
      if (cached) {
        this.globalData.userInfo = cached;
        return true;
      }
      wx.redirectTo({ url: '/pages/login/login' });
      return false;
    }
    return true;
  },
});
