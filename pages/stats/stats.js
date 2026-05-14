// pages/stats/stats.js - 统计报表页
const { formatDate, formatAmount } = require('../../utils/util');
const { getCategoryById, CATEGORIES } = require('../../utils/categories');

Page({
  data: {
    currentBook: null,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,

    // 月度总计
    totalExpense: 0,
    totalIncome: 0,
    totalExpenseText: '0.00',
    totalIncomeText: '0.00',
    netAmountText: '0.00',
    netAmountType: 'income',

    // 分类统计列表
    categoryStats: [],

    // 成员统计（多人账本）
    memberStats: [],

    // 当前视图：'category' | 'member' | 'trend' | 'health'
    activeTab: 'category',

    // 财务健康评分
    healthScore: 0,
    healthLevel: '',        // '优秀'|'良好'|'一般'|'待改善'
    healthColor: '#52C41A',
    healthDimensions: [],   // 各维度评分
    healthTips: [],         // 改善建议

    // 月份选择
    months: [],
    loading: false,

    // ECharts 数据（通过组件传入）
    pieData: [],
    barData: { months: [], expense: [], income: [] },
  },

  async onLoad() {
    const app = getApp();
    if (!app.guardLogin()) return;
    const book = app.globalData.currentBook;
    if (!book) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }
    // 生成最近12个月选项
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: `${d.getFullYear()}年${d.getMonth() + 1}月` });
    }
    this.setData({ currentBook: book, months });
    await this.loadStats();
  },

  // 切换月份
  onMonthChange(e) {
    const idx = e.detail.value;
    const { year, month } = this.data.months[idx];
    this.setData({ year, month });
    this.loadStats();
  },

  // 切换视图tab
  switchTab(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  // 跳转 AI 分析页
  goToAI() {
    wx.navigateTo({ url: `/pages/ai/ai?year=${this.data.year}&month=${this.data.month}` });
  },

  // 点击成员项，查看该成员的账单明细
  onMemberTap(e) {
    const { openid, name } = e.currentTarget.dataset;
    const app = getApp();
    app.globalData.currentFilter = { memberOpenid: openid, filterTitle: name };
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 点击分类项，查看该分类的账单明细
  onCategoryTap(e) {
    const { id, name } = e.currentTarget.dataset;
    const app = getApp();
    app.globalData.currentFilter = { categoryId: id, filterTitle: name };
    wx.switchTab({ url: '/pages/index/index' });
  },

  // 上/下月
  prevMonth() {
    let { year, month } = this.data;
    month--;
    if (month < 1) { month = 12; year--; }
    this.setData({ year, month });
    this.loadStats();
  },
  nextMonth() {
    let { year, month } = this.data;
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    month++;
    if (month > 12) { month = 1; year++; }
    this.setData({ year, month });
    this.loadStats();
  },

  async loadStats() {
    this.setData({ loading: true });
    const { currentBook, year, month } = this.data;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'getStats',
        data: {
          action: 'fullStats',
          bookId: currentBook._id,
          year,
          month,
        },
      });

      if (result.code === 0) {
        const { expense, income, categories, members, trend } = result.data;

        const net = (income || 0) - (expense || 0);

        // 构建分类统计+饼图数据
        const categoryStats = (categories || []).map(c => {
          const catInfo = getCategoryById(c.categoryId);
          return {
            ...c,
            icon: catInfo.icon,
            name: catInfo.name,
            color: catInfo.color,
            percent: expense > 0 ? Math.round((c.total / expense) * 100) : 0,
            totalText: (c.total || 0).toFixed(2),
          };
        }).sort((a, b) => b.total - a.total);

        const pieData = categoryStats.slice(0, 8).map(c => ({
          name: c.name,
          value: c.total,
          valueText: (c.total || 0).toFixed(2),
          color: c.color,
        }));

        // 成员统计，添加格式化金额和占比
        const maxExpense = Math.max(...(members || []).map(m => m.expense || 0), 1);
        const memberStats = (members || []).map(m => {
          const nick = m.nickName || '未知成员';
          const disp = m.displayName || '';
          const fullName = disp ? `${nick}（${disp}）` : nick;
          return {
            ...m,
            nickName: nick,
            displayName: disp,
            fullName,
            expenseText: (m.expense || 0).toFixed(2),
            incomeText: (m.income || 0).toFixed(2),
            expensePercent: maxExpense > 0 ? Math.round((m.expense || 0) / maxExpense * 100) : 0,
          };
        });

        // 趋势图数据（近6月）
        const barData = {
          months: (trend || []).map(t => `${t.month}月`),
          expense: (trend || []).map(t => t.expense),
          income: (trend || []).map(t => t.income),
        };

        // 计算财务健康评分
        const healthResult = this._calcHealthScore({
          expense: expense || 0,
          income: income || 0,
          net,
          categories,
          trend: trend || [],
        });

        this.setData({
          totalExpense: expense || 0,
          totalIncome: income || 0,
          totalExpenseText: (expense || 0).toFixed(2),
          totalIncomeText: (income || 0).toFixed(2),
          netAmountText: net.toFixed(2),
          netAmountType: net >= 0 ? 'income' : 'expense',
          categoryStats,
          memberStats,
          pieData,
          barData,
          ...healthResult,
        });
      }
    } catch (e) {
      wx.showToast({ title: '加载统计失败', icon: 'none' });
    }
    this.setData({ loading: false });
  },

  /**
   * 财务健康评分算法
   * 满分100分，5个维度各20分
   */
  _calcHealthScore({ expense, income, net, categories, trend }) {
    const dims = [];
    const tips = [];
    let totalScore = 0;

    // ① 储蓄率 (0-20分)：结余/收入
    let savingsScore = 0;
    if (income > 0) {
      const savingsRate = net / income;
      if (savingsRate >= 0.3) savingsScore = 20;
      else if (savingsRate >= 0.2) savingsScore = 16;
      else if (savingsRate >= 0.1) savingsScore = 12;
      else if (savingsRate >= 0) savingsScore = 8;
      else savingsScore = 0;  // 入不敷出
      if (savingsRate < 0.2) tips.push('💡 建议将储蓄率提升到收入的20%以上');
    } else {
      savingsScore = 0;
      tips.push('💡 本月无收入记录，注意记录所有收入来源');
    }
    dims.push({ name: '储蓄率', score: savingsScore, max: 20, icon: '💰',
      desc: income > 0 ? `储蓄率 ${((net/income)*100).toFixed(0)}%` : '无收入记录' });
    totalScore += savingsScore;

    // ② 生活必需品占比 (0-20分)：餐饮+交通+住房 < 50%支出为优
    let necessityScore = 20;
    if (expense > 0 && categories && categories.length > 0) {
      const necessityIds = ['meal', 'food', 'transport', 'housing'];
      const necessityTotal = categories
        .filter(c => necessityIds.includes(c.categoryId))
        .reduce((s, c) => s + c.total, 0);
      const necessityRate = necessityTotal / expense;
      if (necessityRate <= 0.5) necessityScore = 20;
      else if (necessityRate <= 0.6) necessityScore = 15;
      else if (necessityRate <= 0.7) necessityScore = 10;
      else necessityScore = 5;
      if (necessityRate > 0.6) tips.push('🍚 基本生活开销占比偏高，可考虑优化餐饮或住房成本');
    }
    dims.push({ name: '消费结构', score: necessityScore, max: 20, icon: '📊',
      desc: '生活必需品支出占比' });
    totalScore += necessityScore;

    // ③ 娱乐/社交消费控制 (0-20分)：娱乐+人情 < 20%支出为优
    let leisureScore = 20;
    if (expense > 0 && categories && categories.length > 0) {
      const leisureIds = ['leisure', 'social'];
      const leisureTotal = categories
        .filter(c => leisureIds.includes(c.categoryId))
        .reduce((s, c) => s + c.total, 0);
      const leisureRate = leisureTotal / expense;
      if (leisureRate <= 0.2) leisureScore = 20;
      else if (leisureRate <= 0.3) leisureScore = 14;
      else if (leisureRate <= 0.4) leisureScore = 8;
      else leisureScore = 3;
      if (leisureRate > 0.3) tips.push('🎮 娱乐社交消费偏高，注意适当控制');
    }
    dims.push({ name: '消费自律', score: leisureScore, max: 20, icon: '🎯',
      desc: '娱乐社交支出占比' });
    totalScore += leisureScore;

    // ④ 收支稳定性 (0-20分)：近6月都有记录且波动不大
    let stabilityScore = 10;  // 默认10分（无历史数据）
    if (trend && trend.length >= 3) {
      const months = trend.filter(t => t.expense > 0 || t.income > 0);
      if (months.length >= 3) stabilityScore = 14;
      if (months.length >= 5) stabilityScore = 18;
      if (months.length >= 6) stabilityScore = 20;
    }
    dims.push({ name: '记账坚持', score: stabilityScore, max: 20, icon: '📅',
      desc: `近${trend.length}个月有记录` });
    totalScore += stabilityScore;

    // ⑤ 收入健康度 (0-20分)：有收入记录、收入>0
    let incomeScore = 0;
    if (income >= expense * 1.5) incomeScore = 20;
    else if (income >= expense) incomeScore = 16;
    else if (income >= expense * 0.8) incomeScore = 10;
    else if (income > 0) incomeScore = 6;
    else incomeScore = 0;
    if (income === 0) tips.push('📝 没有收入记录，请记录工资或其他收入');
    else if (income < expense) tips.push('📈 本月支出超过收入，注意控制开支');
    dims.push({ name: '收支平衡', score: incomeScore, max: 20, icon: '⚖️',
      desc: income > 0 ? `收入/支出 = ${(income/Math.max(expense,1)).toFixed(1)}x` : '无收入' });
    totalScore += incomeScore;

    // 等级判断
    let healthLevel, healthColor;
    if (totalScore >= 85) { healthLevel = '优秀'; healthColor = '#52C41A'; }
    else if (totalScore >= 70) { healthLevel = '良好'; healthColor = '#73D13D'; }
    else if (totalScore >= 55) { healthLevel = '一般'; healthColor = '#FAAD14'; }
    else if (totalScore >= 40) { healthLevel = '待改善'; healthColor = '#FF7A45'; }
    else { healthLevel = '需关注'; healthColor = '#FF4D4F'; }

    if (tips.length === 0) tips.push('✅ 财务状况良好，继续保持！');

    return {
      healthScore: totalScore,
      healthLevel,
      healthColor,
      healthDimensions: dims,
      healthTips: tips,
    };
  },

  formatAmount,
});
