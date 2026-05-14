// pages/login/login.js
const db = require('../../utils/db');

Page({
  data: {
    avatarUrl: '',
    nickName: '',
    displayName: '',
    loading: false,
  },

  onLoad() {
    // 如果已有缓存的用户信息，直接跳转
    const app = getApp();
    if (app.globalData.userInfo && app.globalData.currentBook) {
      this.goToMain();
    }
  },

  // 选择头像（上传到云存储获取永久 URL）
  async onChooseAvatar(e) {
    const tempUrl = e.detail.avatarUrl;
    this.setData({ avatarUrl: tempUrl });

    try {
      const ext = tempUrl.match(/\.([a-zA-Z]+)$/)?.[1] || 'jpg';
      const cloudPath = `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const { fileID } = await wx.cloud.uploadFile({
        cloudPath,
        filePath: tempUrl,
      });
      const { tempFileURL } = await wx.cloud.getTempFileURL({ fileList: [fileID] });
      if (tempFileURL && tempFileURL[0] && tempFileURL[0].tempFileURL) {
        this.setData({ avatarUrl: tempFileURL[0].tempFileURL });
      }
    } catch (err) {
      console.error('头像上传失败:', err);
    }
  },

  // 微信昵称输入事件（type="nickname" 自动填充真实微信昵称）
  onNickNameInput(e) {
    const value = e.detail.value;

    // 逻辑：只在昵称为空时接受输入（第一次）
    // 获取后 wx:if 会销毁 input，这里是双重保险
    if (!this.data.nickName && value && value.trim().length > 0) {
      // 设置昵称 → wx:if="{{!nickName}}" 会立即销毁 input
      this.setData({ nickName: value.trim() });
    }
  },

  // 输入显示昵称
  onDisplayNameInput(e) {
    this.setData({ displayName: e.detail.value });
  },

  // 点击进入
  async handleEnter() {
    const { avatarUrl, nickName, displayName } = this.data;

    if (!nickName) {
      wx.showToast({ title: '请先点击上方输入框获取微信昵称', icon: 'none' });
      return;
    }

    this.setData({ loading: true });
    try {
      const userInfo = {
        nickName: nickName,
        avatarUrl: avatarUrl || '',
        displayName: displayName || '',
      };
      const user = await db.getOrCreateUser(userInfo);

      const app = getApp();
      app.globalData.userInfo = userInfo;
      wx.setStorageSync('userInfo', userInfo);

      await app.checkLogin().catch(() => {});

      const books = await db.getUserBooks();
      app.globalData.bookList = books;

      if (books.length === 0) {
        wx.redirectTo({ url: '/pages/book/book?mode=onboard' });
      } else {
        const lastBook = wx.getStorageSync('currentBook');
        const currentBook = lastBook
          ? books.find(b => b._id === lastBook._id) || books[0]
          : books[0];
        app.globalData.currentBook = currentBook;
        wx.setStorageSync('currentBook', currentBook);
        this.goToMain();
      }
    } catch (err) {
      console.error('login error:', err);
      wx.showToast({ title: '登录失败，请重试', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  goToMain() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
