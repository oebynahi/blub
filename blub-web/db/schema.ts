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

export const activity = sqliteTable("activity", {
  id: integer("id").primaryKey({autoIncrement:true}),
  eventKey: text("event_key").notNull().unique(),
  recipient: text("recipient").notNull().references(()=>users.id),
  actor: text("actor").notNull().references(()=>users.id),
  friendship: text("friendship").notNull().references(()=>friendships.id,{onDelete:"cascade"}),
  kind: text("kind").notNull(),
  post: text("post").references(()=>posts.id,{onDelete:"cascade"}),
  comment: integer("comment").references(()=>comments.id,{onDelete:"cascade"}),
  created: integer("created").notNull(),
  seen: integer("seen").notNull().default(0),
  hidden: integer("hidden").notNull().default(0),
}, t=>[index("activity_inbox").on(t.recipient,t.hidden,t.seen,t.id)]);

export const devices = sqliteTable("notification_devices", {
  token:text("token").primaryKey(), owner:text("owner").notNull().references(()=>users.id),
  environment:text("environment").notNull(), since:integer("since").notNull(),
});
export const deliveries = sqliteTable("push_deliveries", {
  event:integer("event").notNull().references(()=>activity.id,{onDelete:"cascade"}),
  token:text("token").notNull().references(()=>devices.token,{onDelete:"cascade"}),
  due:integer("due").notNull(), attempts:integer("attempts").notNull().default(0),
}, t=>[primaryKey({columns:[t.event,t.token]}),index("push_due").on(t.due)]);
export const digests = sqliteTable("digest_settings", {
  owner:text("owner").primaryKey().references(()=>users.id),email:text("email").notNull(),
  since:integer("since").notNull(),due:integer("due").notNull(),
});
