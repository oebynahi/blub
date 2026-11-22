import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
export const users = sqliteTable("users", {id:text("id").primaryKey(),name:text("name").notNull(),handle:text("handle").notNull().unique(),avatar:text("avatar"),bio:text("bio").notNull().default(""),createdAt:integer("created_at").notNull()});
export const friendships = sqliteTable("friendships", {id:text("id").primaryKey(),sender:text("sender").notNull().references(()=>users.id),recipient:text("recipient").notNull().references(()=>users.id),status:text("status").notNull().default("pending"),createdAt:integer("created_at").notNull()},t=>[index("friendships_sender_status").on(t.sender,t.status),index("friendships_recipient_status").on(t.recipient,t.status)]);
export const posts = sqliteTable("posts", {id:text("id").primaryKey(),author:text("author").notNull().references(()=>users.id),caption:text("caption").notNull(),photo:text("photo").notNull(),createdAt:integer("created_at").notNull()},t=>[index("posts_author_date").on(t.author,t.createdAt)]);

export const likes = sqliteTable("likes", {
  post: text("post").notNull().references(() => posts.id, { onDelete: "cascade" }),
  author: text("author").notNull().references(() => users.id),
}, table => [primaryKey({ columns: [table.post, table.author] })]);

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  post: text("post").notNull().references(() => posts.id, { onDelete: "cascade" }),
  author: text("author").notNull().references(() => users.id),
  body: text("body").notNull(),
  requestId: text("request_id").notNull(),
}, table => [
  index("comments_post_id").on(table.post, table.id),
  uniqueIndex("comments_request").on(table.post, table.author, table.requestId),
]);
