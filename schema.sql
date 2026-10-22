CREATE DATABASE IF NOT EXISTS god_diamonds
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE god_diamonds;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY,
  game VARCHAR(40) NOT NULL,
  player_id VARCHAR(80) NOT NULL,
  nickname VARCHAR(120) NOT NULL,
  product_name VARCHAR(120) NOT NULL,
  amount_cents INT UNSIGNED NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'PEN',
  status ENUM('pending','paid','delivered','cancelled') NOT NULL DEFAULT 'pending',
  culqi_order_id VARCHAR(100) NULL UNIQUE,
  payment_reference VARCHAR(120) NULL,
  notification_sent_at DATETIME NULL,
  delivered_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status_created (status, created_at)
);

CREATE TABLE IF NOT EXISTS webhook_events (
  event_id VARCHAR(150) PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
