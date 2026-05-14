# 数据库结构设计

## 集合 1：users（用户）

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 微信openid（云开发自动填充） |
| nickName | string | 微信昵称 |
| avatarUrl | string | 头像URL |
| createdAt | date | 注册时间 |
| updatedAt | date | 最后更新 |

**权限设置**：仅创建者可读写

---

## 集合 2：books（账本）

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 创建者openid |
| name | string | 账本名称，如"家庭日常" |
| icon | string | emoji图标，如"📒" |
| inviteCode | string | 6位大写邀请码，全局唯一 |
| createdAt | date | 创建时间 |

**权限设置**：所有人可读（用于邀请码查找）；仅创建者可写

---

## 集合 3：book_members（账本成员关系）

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 成员openid（云开发自动填充） |
| bookId | string | 账本ID |
| role | string | "admin"（管理员）或"member"（成员） |
| joinedAt | date | 加入时间 |

**权限设置**：仅创建者（_openid匹配）可读写，新增允许所有登录用户

---

## 集合 4：bills（账单记录）— 核心集合

| 字段 | 类型 | 说明 |
|------|------|------|
| _id | string | 自动生成 |
| _openid | string | 记账人openid（云开发自动填充） |
| bookId | string | 所属账本ID |
| type | string | "expense"（支出）或"income"（收入） |
| amount | number | 金额（单位：元，保留2位小数） |
| categoryId | string | 分类ID，见分类体系 |
| categoryName | string | 分类名（冗余，方便展示） |
| categoryIcon | string | 分类emoji |
| categoryColor | string | 分类颜色hex |
| subCategory | string | 子分类，如"午餐"（可选） |
| date | string | 日期 YYYY-MM-DD |
| note | string | 备注（可选，最多50字） |
| nickName | string | 记账人昵称（冗余，方便列表展示） |
| avatarUrl | string | 记账人头像（冗余） |
| createdAt | date | 创建时间 |
| updatedAt | date | 更新时间 |

**权限设置**：
- 读：账本成员（通过bookId校验）
- 写：账本成员
- 删除：记账人本人 或 管理员

**索引建议**：
- bookId + date（复合索引，主要查询场景）
- bookId + _openid（成员过滤）
- bookId + categoryId（分类统计）

---

## 权限安全规则（security rules）

```json
{
  "bills": {
    "read": "auth.openid != null",
    "write": "auth.openid != null",
    "create": "auth.openid != null",
    "update": "doc._openid == auth.openid",
    "delete": "doc._openid == auth.openid"
  }
}
```

注意：跨账本权限校验在云函数层处理（查询前验证 book_members）
