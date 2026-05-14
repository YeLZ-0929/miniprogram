// pages/index/index.js - 账单列表首页
const db = require('../../utils/db');
const { formatDate, groupBillsByDate, relativeDateText, formatAmount, currentMonthRange } = require('../../utils/util');
const { getCategoryById } = require('../../utils/categories');

Page({
  data: {
    currentBook: null,
    billGroups: [],       // 按日期分组的账单
    monthExpense: 0,
    monthIncome: 0,
    monthExpenseText: '0.00',
    monthIncomeText: '0.00',
    netAmountText: '0.00',
    netAmountType: 'income',  // 'income' | 'expense'
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 30,
    // 筛选
    filterType: 'all',    // 'all' | 'expense' | 'income'
  },

  async onLoad(options) {
    const app = getApp();
    if (!app.guardLogin()) return;
    const book = app.globalData.currentBook;
    if (!book) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ currentBook: book });
    await this.loadBills(true);
  },

  async onShow() {
    const app = getApp();
    // 检查是否有从统计页传来的筛选条件
    if (app.globalData.currentFilter) {
      const filter = app.globalData.currentFilter;
      app.globalData.currentFilter = null; // 消费一次后清除
      this.setData({
        filterCategoryId: filter.categoryId || '',
        filterMemberOpenid: filter.memberOpenid || '',
        filterTitle: filter.filterTitle || '',
      });
      await this.loadBills(true);
      return;
    }
    // 正常刷新
    await this.loadBills(true);
  },

  async loadBills(reset = false) {
    if (this.data.loading) return;
    const { currentBook, filterType, pageSize } = this.data;
    const page = reset ? 1 : this.data.page;

    this.setData({ loading: true });

    try {
      // 查询最近3个月的账单（避免一次性加载太多，同时覆盖大部分使用场景）
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      const bills = await db.getBills({
        bookId: currentBook._id,
        startDate: formatDate(start, 'YYYY-MM-DD'),
        endDate: formatDate(end, 'YYYY-MM-DD'),
        type: filterType === 'all' ? null : filterType,
        categoryId: this.data.filterCategoryId || undefined,
        memberOpenid: this.data.filterMemberOpenid || undefined,
        page,
        pageSize,
      });

      // 给每个账单附上日期友好文本
      const enriched = bills.map(b => ({
        ...b,
        dateText: relativeDateText(formatDate(b.date, 'YYYY-MM-DD')),
        amountText: formatAmount(b.amount),
      }));

      const allBills = reset ? enriched : [
        ...this.data.billGroups.flatMap(g => g.bills),
        ...enriched,
      ];

      const groups = groupBillsByDate(allBills);

      // 为每个分组添加格式化金额文本（WXML 不支持 .toFixed()）
      const groupsWithText = groups.map(g => ({
        ...g,
        totalExpenseText: (g.totalExpense || 0).toFixed(2),
        totalIncomeText: (g.totalIncome || 0).toFixed(2),
      }));

      this.setData({
        billGroups: groupsWithText,
        page: page + 1,
        hasMore: bills.length === pageSize,
      });

      // 计算汇总（与查询范围一致）
      this.calcSummaryFromBills();
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }

    this.setData({ loading: false });
  },

  // 从已加载的账单数据计算汇总（与 loadBills 查询范围保持一致）
  calcSummaryFromBills() {
    const allBills = this.data.billGroups.flatMap(g => g.bills);
    let expense = 0, income = 0;
    allBills.forEach(b => {
      const amt = Number(b.amount) || 0;
      if (b.type === 'expense') expense += amt;
      else income += amt;
    });
    const net = income - expense;
    this.setData({
      monthExpense: expense,
      monthIncome: income,
      monthExpenseText: expense.toFixed(2),
      monthIncomeText: income.toFixed(2),
      netAmountText: net.toFixed(2),
      netAmountType: net >= 0 ? 'income' : 'expense',
    });
  },

  // 筛选切换
  switchFilter(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type });
    this.loadBills(true);
  },

  // 切换账本
  switchBook() {
    wx.navigateTo({ url: '/pages/book/book' });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore) this.loadBills(false);
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.loadBills(true).then(() => wx.stopPullDownRefresh());
  },

  // 点击账单进入详情/编辑
  onBillTap(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/bill/bill?id=${id}` });
  },

  // 前往搜索
  goSearch() {
    wx.navigateTo({ url: '/pages/search/search' });
  },

  // 前往预算
  goBudget() {
    wx.navigateTo({ url: '/pages/budget/budget' });
  },

  // 清除筛选（从统计页跳转时）
  clearFilter() {
    this.setData({
      filterCategoryId: '',
      filterMemberOpenid: '',
      filterTitle: '',
    });
    this.loadBills(true);
  },

  formatAmount,
});
