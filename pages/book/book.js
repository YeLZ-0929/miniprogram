// pages/book/book.js - 账本管理页
const db = require('../../utils/db');

Page({
  data: {
    mode: 'list',        // 'list' | 'onboard' | 'create' | 'join'
    bookList: [],
    currentBookId: '',
    newBookName: '',
    inviteCode: '',
    loading: false,
    showInviteModal: false,
    selectedBook: null,
    // 成员管理
    showMemberModal: false,
    memberList: [],
    memberBookId: '',
    memberBookName: '',
    memberIsAdmin: false,
  },

  async onLoad(options) {
    const mode = options.mode || 'list';
    const app = getApp();
    this.setData({
      mode,
      bookList: app.globalData.bookList || [],
      currentBookId: app.globalData.currentBook?._id || '',
    });
    if (mode === 'list') {
      await this.loadBooks();
    }
  },

  async loadBooks() {
    this.setData({ loading: true });
    try {
      const books = await db.getUserBooks();
      const app = getApp();
      app.globalData.bookList = books;
      this.setData({ bookList: books });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  // 切换到创建模式
  goCreate() {
    this.setData({ mode: 'create', newBookName: '' });
  },

  // 切换到加入模式
  goJoin() {
    this.setData({ mode: 'join', inviteCode: '' });
  },

  goBack() {
    const { mode, bookList } = this.data;
    if (mode !== 'list' && mode !== 'onboard') {
      this.setData({ mode: bookList.length > 0 ? 'list' : 'onboard' });
    } else {
      wx.navigateBack();
    }
  },

  onBookNameInput(e) {
    this.setData({ newBookName: e.detail.value });
  },

  onInviteCodeInput(e) {
    this.setData({ inviteCode: e.detail.value.toUpperCase() });
  },

  // 创建账本
  async handleCreate() {
    const { newBookName } = this.data;
    if (!newBookName.trim()) {
      wx.showToast({ title: '请输入账本名称', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const book = await db.createBook(newBookName.trim());
      const app = getApp();
      app.globalData.currentBook = book;
      wx.setStorageSync('currentBook', book);
      app.globalData.bookList = [book, ...app.globalData.bookList];

      wx.showToast({ title: '创建成功', icon: 'success' });
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
      }, 800);
    } catch (e) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  // 通过邀请码加入
  async handleJoin() {
    const { inviteCode } = this.data;
    if (inviteCode.length < 6) {
      wx.showToast({ title: '请输入6位邀请码', icon: 'none' });
      return;
    }
    this.setData({ loading: true });
    try {
      const { result } = await db.joinBookByCode(inviteCode);
      if (result.code === 0) {
        const app = getApp();
        app.globalData.currentBook = result.book;
        wx.setStorageSync('currentBook', result.book);
        wx.showToast({ title: `已加入「${result.book.name}」`, icon: 'success' });
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' });
        }, 800);
      } else {
        wx.showToast({ title: result.msg || '邀请码无效', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: '加入失败', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  // 切换当前账本
  switchBook(e) {
    const book = this.data.bookList[e.currentTarget.dataset.index];
    const app = getApp();
    app.globalData.currentBook = book;
    wx.setStorageSync('currentBook', book);
    this.setData({ currentBookId: book._id });
    wx.showToast({ title: `已切换到「${book.name}」`, icon: 'success' });
  },

  // 显示邀请码弹窗
  showInvite(e) {
    const book = this.data.bookList[e.currentTarget.dataset.index];
    this.setData({ showInviteModal: true, selectedBook: book });
  },

  hideInviteModal() {
    this.setData({ showInviteModal: false, selectedBook: null });
  },

  // 复制邀请码
  copyCode() {
    const code = this.data.selectedBook?.inviteCode;
    if (code) {
      wx.setClipboardData({ data: code });
    }
  },

  // ===== 成员管理 =====

  // 显示成员列表弹窗
  async showMemberList(e) {
    const book = this.data.bookList[e.currentTarget.dataset.index];
    this.setData({
      memberBookId: book._id,
      memberBookName: book.name,
      showMemberModal: true,
      memberList: [],
    });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'manageBook',
        data: { action: 'getMembers', bookId: book._id },
      });
      if (result.code === 0) {
        const myOpenid = getApp().globalData.openid || '';
        const myRole = result.data.find(m => m.openid === myOpenid)?.role || 'member';
        this.setData({
          memberList: result.data,
          memberIsAdmin: myRole === 'admin',
        });
      } else {
        wx.showToast({ title: result.msg || '获取成员失败', icon: 'none' });
        this.setData({ showMemberModal: false });
      }
    } catch (e) {
      wx.showToast({ title: '获取成员失败', icon: 'none' });
      this.setData({ showMemberModal: false });
    }
  },

  // 关闭成员列表弹窗
  hideMemberModal() {
    this.setData({ showMemberModal: false });
  },

  // 移除成员
  removeMember(e) {
    const { openid, name } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认移除',
      content: `确定将「${name}」移出该账本吗？`,
      confirmColor: '#FF4D4F',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'manageBook',
            data: {
              action: 'removeMember',
              bookId: this.data.memberBookId,
              targetOpenid: openid,
            },
          });
          if (result.code === 0) {
            wx.showToast({ title: '已移除', icon: 'success' });
            // 刷新成员列表
            this.showMemberList({ currentTarget: { dataset: { index: this.data.bookList.findIndex(b => b._id === this.data.memberBookId) } } });
          } else {
            wx.showToast({ title: result.msg || '移除失败', icon: 'none' });
          }
        } catch (e) {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      },
    });
  },
});
