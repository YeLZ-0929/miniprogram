// pages/search/search.js - 账单搜索页
const { formatDate, relativeDateText, formatAmount } = require('../../utils/util');
const { CATEGORIES, getCategoryById } = require('../../utils/categories');

Page({
  data: {
    currentBook: null,

    // 搜索条件
    keyword: '',
    selectedType: 'all',   // 'all'|'expense'|'income'
    selectedCatId: '',     // 空=不限
    minAmount: '',
    maxAmount: '',
    startDate: '',
    endDate: '',

    // 结果
    results: [],
    totalCount: 0,
    totalText: '0.00',
    loading: false,
    searched: false,   // 是否已触发过搜索

    // 分类选项
    catOptions: [],
    selectedCatName: '全部分类',

    // 显示高级筛选
    showAdvanced: false,
  },

  onLoad() {
    const app = getApp();
    const book = app.globalData.currentBook;
    if (!book) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    // 构建分类选项
    const catOptions = [{ id: '', name: '全部分类', icon: '📋' }, ...CATEGORIES];
    this.setData({ currentBook: book, catOptions });
  },

  // 关键词输入
  onKeywordInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  // 搜索（按回车或点击搜索按钮）
  doSearch() {
    this.setData({ searched: true });
    this._search();
  },

  // 清空搜索
  clearSearch() {
    this.setData({
      keyword: '',
      selectedType: 'all',
      selectedCatId: '',
      selectedCatName: '全部分类',
      minAmount: '',
      maxAmount: '',
      startDate: '',
      endDate: '',
      results: [],
      totalCount: 0,
      totalText: '0.00',
      searched: false,
    });
  },

  // 收支类型切换
  switchType(e) {
    this.setData({ selectedType: e.currentTarget.dataset.type });
    if (this.data.searched) this._search();
  },

  // 切换分类
  selectCategory() {
    const { catOptions, selectedCatId } = this.data;
    const items = catOptions.map(c => `${c.icon || ''} ${c.name}`);
    const current = catOptions.findIndex(c => c.id === selectedCatId);
    wx.showActionSheet({
      itemList: items,
      success: (res) => {
        const cat = catOptions[res.tapIndex];
        this.setData({ selectedCatId: cat.id, selectedCatName: cat.name });
        if (this.data.searched) this._search();
      }
    });
  },

  onMinAmountInput(e) {
    this.setData({ minAmount: e.detail.value.replace(/[^\d.]/g, '') });
  },
  onMaxAmountInput(e) {
    this.setData({ maxAmount: e.detail.value.replace(/[^\d.]/g, '') });
  },
  onStartDateChange(e) {
    this.setData({ startDate: e.detail.value });
    if (this.data.searched) this._search();
  },
  onEndDateChange(e) {
    this.setData({ endDate: e.detail.value });
    if (this.data.searched) this._search();
  },

  toggleAdvanced() {
    this.setData({ showAdvanced: !this.data.showAdvanced });
  },

  // 核心搜索逻辑
  async _search() {
    this.setData({ loading: true });
    const { currentBook, keyword, selectedType, selectedCatId, minAmount, maxAmount, startDate, endDate } = this.data;

    try {
      // 通过云函数查询（云函数有管理员权限，可读所有成员账单）
      const { result } = await wx.cloud.callFunction({
        name: 'getStats',
        data: {
          action: 'searchBills',
          bookId: currentBook._id,
          selectedType,
          selectedCatId,
          minAmount,
          maxAmount,
          startDate,
          endDate,
        },
      });

      if (result.code !== 0) {
        wx.showToast({ title: result.msg || '搜索失败', icon: 'none' });
        this.setData({ loading: false });
        return;
      }

      const data = result.data;

      // 关键词在前端过滤（note / categoryName 字段）
      const kw = keyword.trim().toLowerCase();
      const filtered = kw
        ? data.filter(b =>
            (b.note || '').toLowerCase().includes(kw) ||
            (b.categoryName || '').toLowerCase().includes(kw) ||
            String(b.amount).includes(kw)
          )
        : data;

      // 格式化
      const results = filtered.map(b => {
        const cat = getCategoryById(b.categoryId);
        return {
          ...b,
          amountText: formatAmount(b.amount),
          dateText: relativeDateText(formatDate(b.date, 'YYYY-MM-DD')),
          catIcon: cat.icon,
          catName: cat.name,
          catColor: cat.color,
        };
      });

      // 汇总
      const totalExpense = results.filter(r => r.type === 'expense').reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const totalIncome = results.filter(r => r.type === 'income').reduce((s, r) => s + (Number(r.amount) || 0), 0);
      let totalText = '';
      if (selectedType === 'expense') totalText = `支出合计 ¥${totalExpense.toFixed(2)}`;
      else if (selectedType === 'income') totalText = `收入合计 ¥${totalIncome.toFixed(2)}`;
      else totalText = `支出 ¥${totalExpense.toFixed(2)} / 收入 ¥${totalIncome.toFixed(2)}`;

      this.setData({ results, totalCount: results.length, totalText });
    } catch (e) {
      wx.showToast({ title: '搜索失败', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  // 点击账单详情
  onBillTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/bill/bill?id=${id}` });
  },
});
