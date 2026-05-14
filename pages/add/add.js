// pages/add/add.js - 记账录入页
const { formatDate, today, parseTextLocally } = require('../../utils/util');
const { CATEGORIES, getCategoryById, KEYWORD_MAP } = require('../../utils/categories');
const db = require('../../utils/db');

Page({
  data: {
    // 当前录入模式：'manual'|'text'|'photo'
    inputMode: 'manual',

    // 账单表单数据
    bill: {
      type: 'expense',     // 'expense' | 'income'
      amount: '',
      categoryId: 'meal',
      subCategory: '',
      date: today(),
      note: '',
      bookId: '',
    },

    // 分类列表
    categories: [],

    // 智能文字输入
    smartText: '',
    smartParsing: false,
    smartResult: null,     // 单笔解析结果（向后兼容）
    smartResults: [],      // 多笔解析结果列表
    isMultiParse: false,   // 是否解析出多笔

    // 照片OCR
    photoPath: '',
    ocrParsing: false,

    // 分类弹窗
    showCategoryModal: false,
    selectedCategoryIdx: 0,

    // 是否展开子分类
    showSubCategory: false,
    subCategories: [],

    saving: false,
  },

  onLoad() {
    const app = getApp();
    if (!app.guardLogin()) return;
    const book = app.globalData.currentBook;
    if (!book) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    const categories = CATEGORIES.filter(c => c.type === this.data.bill.type);
    this.setData({
      'bill.bookId': book._id,
      'bill.date': today(),
      categories,
    });
  },

  onShow() {
    // 每次进入页面，日期重置为今天
    this.setData({ 'bill.date': today() });
  },

  // ==================== 切换收入/支出 ====================
  switchType(e) {
    const type = e.currentTarget.dataset.type;
    const categories = CATEGORIES.filter(c => c.type === type);
    const defaultCat = categories[0];
    this.setData({
      'bill.type': type,
      'bill.categoryId': defaultCat.id,
      'bill.subCategory': '',
      categories,
      showSubCategory: false,
    });
  },

  // ==================== 切换录入模式 ====================
  switchInputMode(e) {
    this.setData({ inputMode: e.currentTarget.dataset.mode });
  },

  // ==================== 手动录入 ====================
  onAmountInput(e) {
    // 只允许数字和小数点
    let val = e.detail.value.replace(/[^\d.]/g, '');
    const parts = val.split('.');
    if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
    if (parts[1] && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2);
    this.setData({ 'bill.amount': val });
  },

  onNoteInput(e) {
    this.setData({ 'bill.note': e.detail.value });
  },

  onDateChange(e) {
    this.setData({ 'bill.date': e.detail.value });
  },

  // 打开分类选择
  openCategoryModal() {
    const idx = this.data.categories.findIndex(c => c.id === this.data.bill.categoryId);
    this.setData({ showCategoryModal: true, selectedCategoryIdx: Math.max(0, idx) });
  },

  closeCategoryModal() {
    this.setData({ showCategoryModal: false });
  },

  selectCategory(e) {
    const cat = this.data.categories[e.currentTarget.dataset.index];
    const subCategories = cat.children || [];
    this.setData({
      'bill.categoryId': cat.id,
      'bill.subCategory': subCategories.length > 0 ? subCategories[0] : '',
      showCategoryModal: false,
      showSubCategory: subCategories.length > 0,
      subCategories,
    });
  },

  selectSubCategory(e) {
    this.setData({ 'bill.subCategory': e.currentTarget.dataset.sub });
  },

  // ==================== 智能文字识别 ====================
  onSmartTextInput(e) {
    this.setData({ smartText: e.detail.value, smartResult: null, smartResults: [], isMultiParse: false });
  },

  // 解析单笔文字，返回 { amount, categoryId, type, date, note }
  _parseSingleText(text) {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const { amount, keywords } = parseTextLocally(trimmed);

    // 关键词匹配分类
    let matchedCategoryId = this.data.bill.type === 'income' ? 'salary' : 'other_expense';
    for (const [kw, catId] of Object.entries(KEYWORD_MAP)) {
      if (trimmed.includes(kw)) {
        // 检查分类类型是否匹配当前收支类型
        const cat = getCategoryById(catId);
        if (cat && cat.type === this.data.bill.type) {
          matchedCategoryId = catId;
          break;
        }
      }
    }

    return {
      amount: amount || 0,
      categoryId: matchedCategoryId,
      type: this.data.bill.type,
      date: this.data.bill.date,
      note: trimmed,
      raw: trimmed,
    };
  },

  async parseSmartText() {
    const { smartText } = this.data;
    if (!smartText.trim()) return;

    this.setData({ smartParsing: true, smartResult: null, smartResults: [], isMultiParse: false });

    // 检测是否包含逗号（支持中英文逗号）
    const hasComma = /[,，]/.test(smartText);

    if (hasComma) {
      // 多笔模式：按逗号分割，每笔都走云函数解析
      const parts = smartText.split(/[,，]/).map(s => s.trim()).filter(Boolean);
      const results = [];

      for (const part of parts) {
        // 先本地快速提取金额（作为云函数失败的兜底）
        const { amount: localAmount } = parseTextLocally(part);
        let localCatId = 'other_expense';
        for (const [kw, catId] of Object.entries(KEYWORD_MAP)) {
          if (part.includes(kw)) { localCatId = catId; break; }
        }

        try {
          const { result } = await wx.cloud.callFunction({
            name: 'parseText',
            data: { text: part },
          });
          const cloudData = result.data;
          if (cloudData && cloudData.amount) {
            results.push({
              amount: cloudData.amount,
              categoryId: cloudData.categoryId || localCatId,
              type: cloudData.type || this.data.bill.type,
              date: cloudData.date || this.data.bill.date,
              note: cloudData.note || part,
              raw: part,
            });
          } else {
            // 云函数返回无效，用本地结果兜底
            results.push({
              amount: localAmount || 0,
              categoryId: localCatId,
              type: this.data.bill.type,
              date: this.data.bill.date,
              note: part,
              raw: part,
            });
          }
        } catch (e) {
          // 云函数失败，用本地结果兜底
          results.push({
            amount: localAmount || 0,
            categoryId: localCatId,
            type: this.data.bill.type,
            date: this.data.bill.date,
            note: part,
            raw: part,
          });
        }
      }

      if (results.length > 0) {
        this.setData({ smartResults: results, isMultiParse: true });
      }
      this.setData({ smartParsing: false });
      return;
    }

    // 单笔模式：原有逻辑
    try {
      const { amount, keywords } = parseTextLocally(smartText);
      let matchedCategoryId = 'other_expense';
      for (const kw of keywords) {
        if (KEYWORD_MAP[kw]) { matchedCategoryId = KEYWORD_MAP[kw]; break; }
      }
      for (const [kw, catId] of Object.entries(KEYWORD_MAP)) {
        if (smartText.includes(kw)) { matchedCategoryId = catId; break; }
      }

      const { result } = await wx.cloud.callFunction({
        name: 'parseText',
        data: { text: smartText },
      });

      const parsed = result.data || {
        amount: amount,
        categoryId: matchedCategoryId,
        type: 'expense',
        date: today(),
        note: smartText,
      };

      this.setData({ smartResult: parsed });
    } catch (e) {
      const { amount, keywords } = parseTextLocally(smartText);
      let matchedCategoryId = 'other_expense';
      for (const [kw, catId] of Object.entries(KEYWORD_MAP)) {
        if (smartText.includes(kw)) { matchedCategoryId = catId; break; }
      }
      this.setData({
        smartResult: {
          amount: amount || 0,
          categoryId: matchedCategoryId,
          type: 'expense',
          date: today(),
          note: smartText,
        },
      });
    }

    this.setData({ smartParsing: false });
  },

  // 确认使用智能识别结果（单笔）
  confirmSmartResult() {
    const { smartResult } = this.data;
    if (!smartResult) return;
    const cat = getCategoryById(smartResult.categoryId);
    this.setData({
      inputMode: 'manual',
      'bill.amount': String(smartResult.amount || ''),
      'bill.categoryId': smartResult.categoryId || 'other_expense',
      'bill.type': smartResult.type || 'expense',
      'bill.date': smartResult.date || today(),
      'bill.note': smartResult.note || this.data.smartText,
      categories: CATEGORIES.filter(c => c.type === (smartResult.type || 'expense')),
    });
    wx.showToast({ title: '已填入，请确认', icon: 'none' });
  },

  // 批量保存多笔记录
  async saveMultiBills() {
    const { smartResults, bill } = this.data;
    if (!smartResults.length) return;

    this.setData({ saving: true });
    let successCount = 0;
    let failCount = 0;
    const app = getApp();
    const userInfo = app.globalData.userInfo || {};
    const displayNick = userInfo.displayName || userInfo.nickName || '';

    for (const item of smartResults) {
      try {
        const cat = getCategoryById(item.categoryId);
        await db.addBill({
          type: item.type || bill.type,
          amount: parseFloat(item.amount) || 0,
          categoryId: item.categoryId,
          subCategory: '',
          date: item.date || bill.date,
          note: item.note || item.raw || '',
          bookId: bill.bookId,
          categoryName: cat ? cat.name : '',
          categoryIcon: cat ? cat.icon : '',
          categoryColor: cat ? cat.color : '',
          nickName: displayNick,
          avatarUrl: userInfo.avatarUrl || '',
        });
        successCount++;
      } catch (e) {
        failCount++;
      }
    }

    this.setData({
      saving: false,
      smartText: '',
      smartResults: [],
      isMultiParse: false,
    });

    if (failCount === 0) {
      wx.showToast({ title: `成功保存${successCount}笔`, icon: 'success' });
    } else {
      wx.showToast({ title: `${successCount}笔成功，${failCount}笔失败`, icon: 'none' });
    }
  },

  // ==================== 拍照 OCR ====================
  async choosePhoto() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        camera: 'back',
      });
      const path = res.tempFiles[0].tempFilePath;
      this.setData({ photoPath: path, ocrParsing: true });
      await this.doOCR(path);
    } catch (e) {
      if (e.errMsg !== 'chooseMedia:fail cancel') {
        wx.showToast({ title: '选图失败', icon: 'none' });
      }
    }
  },

  async doOCR(filePath) {
    try {
      // 先上传图片到云存储
      const cloudPath = `ocr/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const uploadRes = await wx.cloud.uploadFile({ cloudPath, filePath });

      // 调用OCR云函数
      const { result } = await wx.cloud.callFunction({
        name: 'ocrReceipt',
        data: { fileID: uploadRes.fileID },
      });

      if (result.code === 0 && result.data) {
        const parsed = result.data;
        const cat = getCategoryById(parsed.categoryId || 'other_expense');
        this.setData({
          inputMode: 'manual',
          'bill.amount': String(parsed.amount || ''),
          'bill.categoryId': parsed.categoryId || 'other_expense',
          'bill.type': parsed.type || 'expense',
          'bill.date': parsed.date || today(),
          'bill.note': parsed.note || parsed.merchant || '',
          categories: CATEGORIES.filter(c => c.type === (parsed.type || 'expense')),
        });
        wx.showToast({ title: 'OCR识别成功', icon: 'success' });
      } else {
        wx.showToast({ title: '识别失败，请手动填写', icon: 'none' });
      }
    } catch (e) {
      wx.showToast({ title: 'OCR识别失败', icon: 'none' });
    }
    this.setData({ ocrParsing: false });
  },

  // ==================== 保存账单 ====================
  async saveBill() {
    const { bill } = this.data;

    if (!bill.amount || parseFloat(bill.amount) <= 0) {
      wx.showToast({ title: '请输入金额', icon: 'none' });
      return;
    }
    if (!bill.categoryId) {
      wx.showToast({ title: '请选择分类', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      const app = getApp();
      const userInfo = app.globalData.userInfo || {};
      const displayNick = userInfo.displayName || userInfo.nickName || '';
      const cat = getCategoryById(bill.categoryId);
      await db.addBill({
        ...bill,
        nickName: displayNick,
        avatarUrl: userInfo.avatarUrl || '',
        amount: parseFloat(bill.amount),
        categoryName: cat.name,
        categoryIcon: cat.icon,
        categoryColor: cat.color,
      });
      wx.showToast({ title: '记录成功', icon: 'success' });
      // 重置表单
      setTimeout(() => {
        this.setData({
          'bill.amount': '',
          'bill.note': '',
          'bill.date': today(),
          smartText: '',
          smartResult: null,
          photoPath: '',
        });
      }, 800);
    } catch (e) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
    this.setData({ saving: false });
  },

  // 获取当前选中分类信息（用于展示）
  getCurrentCategory() {
    return getCategoryById(this.data.bill.categoryId);
  },
});
