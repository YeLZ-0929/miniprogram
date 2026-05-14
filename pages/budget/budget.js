// pages/budget/budget.js - 预算管理页
const { formatDate, currentMonthRange } = require('../../utils/util');
const { CATEGORIES, getCategoryById } = require('../../utils/categories');
// 本地存储key（按账本+月份隔离）
function budgetKey(bookId, year, month) {
  return `budget_${bookId}_${year}_${month}`;
}

Page({
  data: {
    currentBook: null,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,

    // 预算设置列表（每个支出分类一条）
    budgetList: [],

    // 本月实际支出（按分类）
    actualMap: {},  // { categoryId: amount }

    // 总览
    totalBudget: 0,
    totalActual: 0,
    totalBudgetText: '0.00',
    totalActualText: '0.00',
    totalPercent: 0,

    // 编辑弹窗
    showEditModal: false,
    editingCat: null,    // { id, name, icon, color }
    editingAmount: '',

    // 分类选择弹窗
    showCatPicker: false,
    pickerCats: [],

    loading: false,
  },

  async onLoad() {
    const app = getApp();
    const book = app.globalData.currentBook;
    if (!book) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    this.setData({ currentBook: book });
    await this.loadData();
  },

  async onShow() {
    if (this.data.currentBook) {
      await this.loadData();
    }
  },

  // 加载预算 + 实际支出
  async loadData() {
    this.setData({ loading: true });
    const { currentBook, year, month } = this.data;

    // 1. 读取本地预算设置
    const key = budgetKey(currentBook._id, year, month);
    const savedStr = wx.getStorageSync(key) || '{}';
    const budgetMap = JSON.parse(savedStr); // { categoryId: amount }

    // 2. 查询本月实际支出（按分类汇总，通过云函数获取所有成员数据）
    const startDate = `${year}-${String(month).padStart(2,'0')}-01`;
    const endDate = `${year}-${String(month).padStart(2,'0')}-${new Date(year, month, 0).getDate()}`;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getStats',
        data: {
          action: 'getBills',
          bookId: currentBook._id,
          startDate,
          endDate,
          type: 'expense',
          pageSize: 500,
        },
      });

      const bills = (result && result.code === 0) ? result.data : [];

      const actualMap = {};
      bills.forEach(b => {
        const catId = b.categoryId || 'other_expense';
        actualMap[catId] = (actualMap[catId] || 0) + (Number(b.amount) || 0);
      });

      // 3. 构建展示列表（只含支出分类）
      const expenseCats = CATEGORIES.filter(c => c.type === 'expense');
      const budgetList = expenseCats.map(cat => {
        const budget = budgetMap[cat.id] || 0;
        const actual = actualMap[cat.id] || 0;
        const percent = budget > 0 ? Math.min(Math.round((actual / budget) * 100), 100) : 0;
        const overBudget = budget > 0 && actual > budget;
        return {
          id: cat.id,
          name: cat.name,
          icon: cat.icon,
          color: cat.color,
          budget,
          actual,
          budgetText: budget > 0 ? budget.toFixed(2) : '未设置',
          actualText: actual.toFixed(2),
          percent,
          overBudget,
          barColor: overBudget ? '#FF4D4F' : cat.color,
        };
      });

      // 只显示设了预算或有支出的分类
      const visibleList = budgetList.filter(b => b.budget > 0 || b.actual > 0);

      // 4. 计算总览
      const totalBudget = budgetList.reduce((s, b) => s + (b.budget || 0), 0);
      const totalActual = budgetList.reduce((s, b) => s + (b.actual || 0), 0);
      const totalPercent = totalBudget > 0 ? Math.min(Math.round((totalActual / totalBudget) * 100), 100) : 0;

      this.setData({
        budgetList: visibleList,
        actualMap,
        totalBudget,
        totalActual,
        totalBudgetText: totalBudget.toFixed(2),
        totalActualText: totalActual.toFixed(2),
        totalPercent,
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  // 打开编辑弹窗（也可以新增未设预算的分类）
  openEdit(e) {
    const catId = e.currentTarget.dataset.id;
    const cat = getCategoryById(catId);
    const { currentBook, year, month } = this.data;
    const key = budgetKey(currentBook._id, year, month);
    const budgetMap = JSON.parse(wx.getStorageSync(key) || '{}');
    const current = budgetMap[catId] || '';
    this.setData({
      showEditModal: true,
      editingCat: cat,
      editingAmount: current ? String(current) : '',
    });
  },

  // 新增预算（弹窗选择分类）
  addBudget() {
    // 筛选出未设置预算的分类（有支出的也保留方便快速设置）
    const expenseCats = CATEGORIES.filter(c => c.type === 'expense');
    // 排除已经在列表里显示过的（已设预算且有支出的）
    const existingIds = this.data.budgetList.map(b => b.id);
    const availableCats = expenseCats.filter(c => !existingIds.includes(c.id));

    if (availableCats.length === 0) {
      wx.showToast({ title: '所有分类已设置预算', icon: 'none' });
      return;
    }

    this.setData({ showCatPicker: true, pickerCats: availableCats });
  },

  // 从分类选择弹窗中选中一个分类
  pickCategory(e) {
    const catId = e.currentTarget.dataset.id;
    const cat = getCategoryById(catId);
    const { currentBook, year, month } = this.data;
    const key = budgetKey(currentBook._id, year, month);
    const budgetMap = JSON.parse(wx.getStorageSync(key) || '{}');
    const current = budgetMap[catId] || '';
    this.setData({
      showCatPicker: false,
      showEditModal: true,
      editingCat: cat,
      editingAmount: current ? String(current) : '',
      pickerCats: [],
    });
  },

  // 关闭分类选择弹窗
  closeCatPicker() {
    this.setData({ showCatPicker: false, pickerCats: [] });
  },

  onEditAmountInput(e) {
    let val = e.detail.value.replace(/[^\d.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (parts[1] && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2);
    this.setData({ editingAmount: val });
  },

  saveEdit() {
    const { editingCat, editingAmount, currentBook, year, month } = this.data;
    if (!editingCat) return;
    const amount = parseFloat(editingAmount);
    if (isNaN(amount) || amount < 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    const key = budgetKey(currentBook._id, year, month);
    const budgetMap = JSON.parse(wx.getStorageSync(key) || '{}');
    if (amount === 0) {
      delete budgetMap[editingCat.id];
    } else {
      budgetMap[editingCat.id] = amount;
    }
    wx.setStorageSync(key, JSON.stringify(budgetMap));
    this.setData({ showEditModal: false, editingCat: null, editingAmount: '' });
    wx.showToast({ title: '预算已保存', icon: 'success' });
    this.loadData();
  },

  cancelEdit() {
    this.setData({ showEditModal: false, editingCat: null, editingAmount: '' });
  },

  // 删除某分类预算
  deleteBudget(e) {
    const catId = e.currentTarget.dataset.id;
    const { currentBook, year, month } = this.data;
    wx.showModal({
      title: '删除预算',
      content: '确定要删除该分类的预算设置吗？',
      confirmColor: '#FF4D4F',
      success: (res) => {
        if (!res.confirm) return;
        const key = budgetKey(currentBook._id, year, month);
        const budgetMap = JSON.parse(wx.getStorageSync(key) || '{}');
        delete budgetMap[catId];
        wx.setStorageSync(key, JSON.stringify(budgetMap));
        this.loadData();
      }
    });
  },

  // 月份切换
  prevMonth() {
    let { year, month } = this.data;
    month--;
    if (month < 1) { month = 12; year--; }
    this.setData({ year, month });
    this.loadData();
  },
  nextMonth() {
    let { year, month } = this.data;
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    month++;
    if (month > 12) { month = 1; year++; }
    this.setData({ year, month });
    this.loadData();
  },
});
