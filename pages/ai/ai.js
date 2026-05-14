// pages/ai/ai.js - AI账单分析页
const app = getApp();

Page({
  data: {
    currentBook: null,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    months: [],

    // 消息列表
    messages: [],
    inputText: '',
    typing: false,       // AI 正在输入
    scrollToId: '',

    // 汇总加载
    summaryLoading: false,
  },

  onLoad() {
    const book = app.globalData.currentBook;
    if (!book) {
      wx.redirectTo({ url: '/pages/login/login' });
      return;
    }

    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        label: `${d.getFullYear()}年${d.getMonth() + 1}月`,
      });
    }

    this.setData({ currentBook: book, months });

    // 添加欢迎消息
    this.addAiMessage('你好！我是你的财务小助手，可以帮你分析账单消费。\n\n你可以点上方卡片生成月度总结，也可以直接问我问题，比如：\n• "我这个月钱都花在哪了？"\n• "餐饮消费正常吗？"\n• "给我一些省钱建议"');
  },

  // 月份切换
  onMonthChange(e) {
    const idx = e.detail.value;
    const { year, month } = this.data.months[idx];
    this.setData({ year, month });
  },
  prevMonth() {
    let { year, month } = this.data;
    month--;
    if (month < 1) { month = 12; year--; }
    this.setData({ year, month });
  },
  nextMonth() {
    let { year, month } = this.data;
    const now = new Date();
    if (year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1)) return;
    month++;
    if (month > 12) { month = 1; year++; }
    this.setData({ year, month });
  },

  // 生成月度总结
  async generateSummary() {
    if (this.data.typing || this.data.summaryLoading) return;

    const { year, month } = this.data;

    // 添加用户消息
    this.addUserMessage(`帮我分析 ${year}年${month}月 的消费情况`);

    this.setData({ summaryLoading: true, typing: true });
    this.scrollToBottom();

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'aiAnalysis',
        data: {
          action: 'monthlySummary',
          bookId: this.data.currentBook._id,
          year,
          month,
        },
      });

      if (result.code === 0) {
        this.addAiMessage(result.analysis);
      } else {
        this.addAiMessage(`分析失败：${result.msg || '未知错误'}`);
      }
    } catch (e) {
      console.error('aiAnalysis error:', e);
      this.addAiMessage('网络出错了，请稍后再试');
    }

    this.setData({ summaryLoading: false, typing: false });
    this.scrollToBottom();
  },

  // 输入框
  onInput(e) {
    this.setData({ inputText: e.detail.value });
  },

  // 发送消息
  async sendMessage() {
    const text = this.data.inputText.trim();
    if (!text || this.data.typing) return;

    this.setData({ inputText: '' });
    this.addUserMessage(text);
    this.scrollToBottom();

    // 调用自由问答
    this.setData({ typing: true });
    this.scrollToBottom();

    try {
      // 构建历史消息（最近10条，不含欢迎消息）
      const history = this.data.messages
        .slice(1)  // 跳过欢迎消息
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));

      const { result } = await wx.cloud.callFunction({
        name: 'aiAnalysis',
        data: {
          action: 'freeChat',
          bookId: this.data.currentBook._id,
          year: this.data.year,
          month: this.data.month,
          question: text,
          history,
        },
      });

      if (result.code === 0) {
        this.addAiMessage(result.reply);
      } else {
        this.addAiMessage(`出错了：${result.msg || '请稍后再试'}`);
      }
    } catch (e) {
      console.error('aiAnalysis freeChat error:', e);
      this.addAiMessage('网络出错了，请稍后再试');
    }

    this.setData({ typing: false });
    this.scrollToBottom();
  },

  // 添加消息
  addUserMessage(content) {
    const messages = [...this.data.messages, { role: 'user', content }];
    this.setData({ messages });
  },
  addAiMessage(content) {
    const messages = [...this.data.messages, { role: 'assistant', content }];
    this.setData({ messages });
  },

  // 滚动到底部
  scrollToBottom() {
    const len = this.data.messages.length;
    setTimeout(() => {
      this.setData({ scrollToId: `msg-${len}` });
    }, 100);
  },
});
