# 家庭账本小程序 — 快速上手指南

## 项目结构

```
miniprogram/
├── app.js / app.json / app.wxss    # 小程序入口
├── pages/
│   ├── login/       # 登录页
│   ├── index/       # 账单列表（Tab1）
│   ├── add/         # 记一笔（Tab2）
│   ├── stats/       # 统计（Tab3）
│   ├── mine/        # 我的（Tab4）
│   ├── bill/        # 账单详情
│   └── book/        # 账本管理
├── utils/
│   ├── util.js      # 日期/金额等工具函数
│   ├── db.js        # 数据库操作封装
│   └── categories.js # 分类配置
└── cloudfunctions/
    ├── manageBook/  # 账本管理（登录、邀请、成员）
    ├── parseText/   # AI文字识别
    ├── ocrReceipt/  # 拍照OCR识别
    └── getStats/    # 统计查询
```

## 使用前配置

### 1. 微信开发者工具设置

1. 打开微信开发者工具 → 导入项目
2. 目录选择 `miniprogram/` 文件夹
3. 在 `project.config.json` 中填入你的 AppID

### 2. 开通云开发

1. 工具栏 → 云开发 → 新建环境
2. 复制环境 ID，填入 `app.js` 中的 `env: 'YOUR_ENV_ID'`

### 3. 创建数据库集合

在云开发控制台 → 数据库，创建以下集合：
- `users`
- `books`
- `book_members`
- `bills`

详细字段结构见 [DATABASE.md](./DATABASE.md)

### 4. 部署云函数

在微信开发者工具中，右键每个云函数文件夹 → 上传并部署：
- `manageBook`
- `parseText`
- `ocrReceipt`（需先 `npm install`）
- `getStats`

### 5. 配置 OCR 和 AI（可选）

**拍照OCR**（`ocrReceipt` 云函数）：
1. 开通腾讯云 OCR 服务：https://console.cloud.tencent.com/ocr
2. 在云函数环境变量中配置：
   - `TENCENT_SECRET_ID`
   - `TENCENT_SECRET_KEY`

**AI文字识别**（`parseText` 云函数）：
1. 开通腾讯混元 API：https://console.cloud.tencent.com/hunyuan
2. 在云函数环境变量中配置：
   - `HUNYUAN_API_KEY`

> 不配置 API Key 时，会自动降级为本地关键词规则匹配，功能正常但识别精度较低。

### 6. 添加 TabBar 图标

在 `images/` 目录中放置以下图片（40×40px，PNG）：
- `tab_bill.png` / `tab_bill_active.png`
- `tab_add.png` / `tab_add_active.png`
- `tab_stats.png` / `tab_stats_active.png`
- `tab_mine.png` / `tab_mine_active.png`

可使用 [iconfont](https://www.iconfont.cn/) 免费图标。

## 功能说明

### 多人账本
- 首次登录后引导创建或加入账本
- 管理员可在"账本管理"中查看6位邀请码
- 家人通过"输入邀请码加入"即可共享账本
- 统计页"成员"视图可查看每人消费对比

### 记账方式
1. **手动录入**：选分类 → 输金额 → 保存（最稳定）
2. **文字识别**：输入一句话如"午饭35元"→ 点智能识别 → 确认
3. **拍照识别**：拍小票/发票 → 自动提取金额和日期

### 分类体系
支出：三餐、食品、日用、交通、休闲、医疗、教育、服饰、住房、人情、其他
收入：工资、兼职、理财、其他收入

## 后续扩展建议

- [ ] 预算设置（每月各类目上限提醒）
- [ ] 账单编辑功能（当前只有删除）
- [ ] 导出Excel（云函数生成，微信文件传输）
- [ ] 微信分享账单截图
- [ ] 定期账单（房租等固定支出自动提醒）
- [ ] ECharts 真实图表（当前统计页为简化版）
