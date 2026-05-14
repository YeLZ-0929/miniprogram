// pages/bill/bill.js - 账单详情/编辑页
const dbUtil = require('../../utils/db');
const { getCategoryById, CATEGORIES, getExpenseCategories, getIncomeCategories } = require('../../utils/categories');
const { formatDate } = require('../../utils/util');

Page({
  data: {
    bill: null,
    loading: true,
    editing: false,
    // 编辑用的临时数据
    editAmount: '',
    editCategoryId: '',
    editSubCategory: '',
    editDate: '',
    editNote: '',
    editType: 'expense',
    // 分类数据
    categories: [],
    subCategories: [],
  },

  async onLoad(options) {
    const { id } = options;
    if (!id) { wx.navigateBack(); return; }
    this.billId = id;
    await this.loadBill();
  },

  async loadBill() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getStats',
        data: { action: 'getBillById', billId: this.billId },
      });
      if (result.code !== 0) throw new Error(result.msg);
      const data = result.data;
      const cat = getCategoryById(data.categoryId);
      const categories = data.type === 'income' ? getIncomeCategories() : getExpenseCategories();
      const selectedCat = CATEGORIES.find(c => c.id === data.categoryId);
      this.setData({
        bill: {
          ...data,
          categoryName: cat.name,
          categoryIcon: cat.icon,
          categoryColor: cat.color,
          amountText: (data.amount || 0).toFixed(2),
          displayCategoryName: cat.name + (data.subCategory ? ' · ' + data.subCategory : ''),
        },
        loading: false,
        editAmount: (data.amount || 0).toString(),
        editCategoryId: data.categoryId || '',
        editSubCategory: data.subCategory || '',
        editDate: data.date || formatDate(new Date()),
        editNote: data.note || '',
        editType: data.type || 'expense',
        categories,
        subCategories: selectedCat ? (selectedCat.children || []) : [],
      });
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' });
      wx.navigateBack();
    }
  },

  // 切换编辑模式
  toggleEdit() {
    if (this.data.editing) {
      // 取消编辑，重置数据
      this.setData({ editing: false });
      this.loadBill();
    } else {
      this.setData({ editing: true });
    }
  },

  // 金额输入
  onAmountInput(e) {
    this.setData({ editAmount: e.detail.value });
  },

  // 日期选择
  onDateChange(e) {
    this.setData({ editDate: e.detail.value });
  },

  // 备注输入
  onNoteInput(e) {
    this.setData({ editNote: e.detail.value });
  },

  // 打开分类选择
  openCategoryModal() {
    this.setData({ showCategoryModal: true });
  },
  closeCategoryModal() {
    this.setData({ showCategoryModal: false });
  },

  // 选择分类
  selectCategory(e) {
    const idx = e.currentTarget.dataset.index;
    const cat = this.data.categories[idx];
    const sub = cat.children || [];
    this.setData({
      editCategoryId: cat.id,
      subCategories: sub,
      editSubCategory: '',
      showCategoryModal: false,
    });
  },

  // 选择子分类
  selectSubCategory(e) {
    this.setData({ editSubCategory: e.currentTarget.dataset.sub });
  },

  // 切换收支类型
  switchType(e) {
    const type = e.currentTarget.dataset.type;
    const categories = type === 'income' ? getIncomeCategories() : getExpenseCategories();
    this.setData({
      editType: type,
      categories,
      editCategoryId: '',
      subCategories: [],
      editSubCategory: '',
    });
  },

  // 保存编辑
  async saveEdit() {
    const { editAmount, editCategoryId, editSubCategory, editDate, editNote, editType } = this.data;
    if (!editAmount || isNaN(parseFloat(editAmount)) || parseFloat(editAmount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }
    if (!editCategoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }
    const cat = getCategoryById(editCategoryId);
    wx.showLoading({ title: '保存中...' });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getStats',
        data: {
          action: 'updateBill',
          billId: this.billId,
          updateData: {
            amount: parseFloat(parseFloat(editAmount).toFixed(2)),
            categoryId: editCategoryId,
            subCategory: editSubCategory || '',
            date: editDate,
            note: editNote || '',
            type: editType,
            categoryName: cat.name,
            categoryIcon: cat.icon,
            categoryColor: cat.color,
          },
        },
      });
      wx.hideLoading();
      if (result.code === 0) {
        wx.showToast({ title: '已保存', icon: 'success' });
        this.setData({ editing: false });
        this.loadBill();
      } else {
        wx.showToast({ title: result.msg || '保存失败', icon: 'none' });
      }
    } catch (e) {
      wx.hideLoading();
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  // 删除记录
  async deleteBill() {
    const { bill } = this.data;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await dbUtil.deleteBill(bill._id);
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(() => wx.navigateBack(), 800);
          } catch (e) {
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      },
    });
  },
});
