// utils/categories.js - 分类配置
const CATEGORIES = [
  {
    id: 'meal',
    name: '三餐',
    icon: '🍚',
    color: '#FF7A45',
    type: 'expense',
    children: ['早餐', '午餐', '晚餐', '夜宵'],
  },
  {
    id: 'food',
    name: '食品',
    icon: '🛒',
    color: '#FFA940',
    type: 'expense',
    children: ['超市', '水果', '零食', '饮料'],
  },
  {
    id: 'daily',
    name: '日用',
    icon: '🧴',
    color: '#36CFC9',
    type: 'expense',
    children: ['清洁', '个护', '厨房', '家居'],
  },
  {
    id: 'transport',
    name: '交通',
    icon: '🚌',
    color: '#40A9FF',
    type: 'expense',
    children: ['地铁', '公交', '打车', '骑行', '停车'],
  },
  {
    id: 'leisure',
    name: '休闲',
    icon: '🎮',
    color: '#B37FEB',
    type: 'expense',
    children: ['电影', '游戏', '运动', '旅游'],
  },
  {
    id: 'medical',
    name: '医疗',
    icon: '💊',
    color: '#FF85C2',
    type: 'expense',
    children: ['药品', '就医', '体检'],
  },
  {
    id: 'education',
    name: '教育',
    icon: '📚',
    color: '#5CDBD3',
    type: 'expense',
    children: ['课程', '书籍', '文具'],
  },
  {
    id: 'clothing',
    name: '服饰',
    icon: '👗',
    color: '#FF9C6E',
    type: 'expense',
    children: ['衣服', '鞋子', '配饰'],
  },
  {
    id: 'social',
    name: '人情',
    icon: '🎁',
    color: '#FF4D94',
    type: 'expense',
    children: ['红包', '礼物', '聚餐'],
  },
  {
    id: 'housing',
    name: '住房',
    icon: '🏠',
    color: '#69C0FF',
    type: 'expense',
    children: ['房租', '水费', '电费', '燃气', '物业'],
  },
  {
    id: 'other_expense',
    name: '其他支出',
    icon: '📦',
    color: '#BFBFBF',
    type: 'expense',
    children: [],
  },
  // 收入分类
  {
    id: 'salary',
    name: '工资',
    icon: '💰',
    color: '#73D13D',
    type: 'income',
    children: ['基本工资', '奖金', '提成'],
  },
  {
    id: 'part_time',
    name: '兼职',
    icon: '💼',
    color: '#40A9FF',
    type: 'income',
    children: [],
  },
  {
    id: 'investment',
    name: '理财',
    icon: '📈',
    color: '#95DE64',
    type: 'income',
    children: ['股票', '基金', '利息'],
  },
  {
    id: 'other_income',
    name: '其他收入',
    icon: '✨',
    color: '#FFD666',
    type: 'income',
    children: [],
  },
];

// 获取所有支出分类
const getExpenseCategories = () => CATEGORIES.filter(c => c.type === 'expense');

// 获取所有收入分类
const getIncomeCategories = () => CATEGORIES.filter(c => c.type === 'income');

// 根据ID获取分类信息
const getCategoryById = (id) => CATEGORIES.find(c => c.id === id) || {
  id: 'other_expense',
  name: '其他',
  icon: '📦',
  color: '#BFBFBF',
  type: 'expense',
};

// NLP关键词映射（用于文字识别）
const KEYWORD_MAP = {
  '早饭': 'meal', '早餐': 'meal', '午饭': 'meal', '午餐': 'meal',
  '晚饭': 'meal', '晚餐': 'meal', '吃饭': 'meal', '外卖': 'meal',
  '菜': 'food', '超市': 'food', '水果': 'food', '零食': 'food',
  '地铁': 'transport', '公交': 'transport', '打车': 'transport', '滴滴': 'transport',
  '电影': 'leisure', '游戏': 'leisure', '运动': 'leisure', '健身': 'leisure',
  '药': 'medical', '医院': 'medical', '看病': 'medical',
  '书': 'education', '课': 'education', '学习': 'education',
  '衣服': 'clothing', '鞋': 'clothing',
  '房租': 'housing', '水电': 'housing', '电费': 'housing', '燃气': 'housing',
  '工资': 'salary', '薪资': 'salary', '奖金': 'salary',
};

module.exports = {
  CATEGORIES,
  getExpenseCategories,
  getIncomeCategories,
  getCategoryById,
  KEYWORD_MAP,
};
