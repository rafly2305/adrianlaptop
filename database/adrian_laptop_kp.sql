CREATE DATABASE IF NOT EXISTS adrian_laptop_kp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; USE adrian_laptop_kp;
SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS branch_sales,branches,activity_logs,notifications,warranty_histories,warranty_claims,warranties,transaction_details,transactions,quality_check_details,quality_checks,accessories,laptop_units,customers,users,roles;
SET FOREIGN_KEY_CHECKS=1;
CREATE TABLE roles(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(50) UNIQUE NOT NULL);
CREATE TABLE branches(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(100) NOT NULL,city VARCHAR(100),status ENUM('Aktif','Nonaktif') DEFAULT 'Aktif');
CREATE TABLE branch_sales(id INT AUTO_INCREMENT PRIMARY KEY,branch_id INT NOT NULL,period_month DATE NOT NULL,total_sales DECIMAL(15,2) DEFAULT 0,units_sold INT DEFAULT 0,FOREIGN KEY(branch_id) REFERENCES branches(id));
CREATE TABLE activity_logs(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,action VARCHAR(80),description VARCHAR(255),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(created_at));
CREATE TABLE notifications(id INT AUTO_INCREMENT PRIMARY KEY,user_id INT NULL,title VARCHAR(150),message VARCHAR(255),is_read TINYINT(1) DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(is_read));
CREATE TABLE users(id INT AUTO_INCREMENT PRIMARY KEY,role_id INT NOT NULL,name VARCHAR(100),username VARCHAR(80) UNIQUE,password VARCHAR(255),status ENUM('aktif','nonaktif') DEFAULT 'aktif',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(role_id) REFERENCES roles(id));
CREATE TABLE customers(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(120) NOT NULL,phone VARCHAR(30) UNIQUE,address TEXT,first_transaction_date DATE,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE laptop_units(id INT AUTO_INCREMENT PRIMARY KEY,unit_code VARCHAR(50) UNIQUE NOT NULL,product_name VARCHAR(255) NOT NULL DEFAULT '',brand VARCHAR(80),model VARCHAR(120),processor VARCHAR(120),ram VARCHAR(50),storage VARCHAR(50),storage_type ENUM('SSD','HDD') DEFAULT 'SSD',gpu VARCHAR(120),screen_size VARCHAR(50),touchscreen ENUM('Ya','Tidak') DEFAULT 'Tidak',serial_number VARCHAR(120),condition_text VARCHAR(120),completeness TEXT,notes TEXT,image_path VARCHAR(255),entry_date DATE,sale_price DECIMAL(15,2) DEFAULT 0,status ENUM('Tersedia','Terjual','Dalam Warranty','Tidak Tersedia') DEFAULT 'Tersedia',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,INDEX(status),INDEX(brand));
CREATE TABLE accessories(id INT AUTO_INCREMENT PRIMARY KEY,name VARCHAR(150),category VARCHAR(100),quantity INT DEFAULT 0,unit VARCHAR(30),status VARCHAR(50),notes TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP);
CREATE TABLE quality_checks(id INT AUTO_INCREMENT PRIMARY KEY,laptop_id INT NOT NULL,check_date DATE,password_info VARCHAR(100),bag TINYINT(1),box_item TINYINT(1),mouse_item TINYINT(1),overall_notes TEXT,checked_by INT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(laptop_id) REFERENCES laptop_units(id),FOREIGN KEY(checked_by) REFERENCES users(id));
CREATE TABLE quality_check_details(id INT AUTO_INCREMENT PRIMARY KEY,quality_check_id INT NOT NULL,item_name VARCHAR(100),result_status ENUM('OK','Tidak OK'),notes TEXT,FOREIGN KEY(quality_check_id) REFERENCES quality_checks(id) ON DELETE CASCADE);
CREATE TABLE transactions(id INT AUTO_INCREMENT PRIMARY KEY,invoice_no VARCHAR(60) UNIQUE,transaction_date DATETIME,user_id INT,customer_id INT,branch_id INT DEFAULT 1,payment_method ENUM('Tunai','Non Tunai'),total DECIMAL(15,2),notes TEXT,status VARCHAR(40),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id),FOREIGN KEY(customer_id) REFERENCES customers(id),FOREIGN KEY(branch_id) REFERENCES branches(id),INDEX(transaction_date));
CREATE TABLE transaction_details(id INT AUTO_INCREMENT PRIMARY KEY,transaction_id INT,laptop_id INT,price DECIMAL(15,2),quantity INT DEFAULT 1,subtotal DECIMAL(15,2),FOREIGN KEY(transaction_id) REFERENCES transactions(id),FOREIGN KEY(laptop_id) REFERENCES laptop_units(id));
CREATE TABLE warranties(id INT AUTO_INCREMENT PRIMARY KEY,transaction_id INT,laptop_id INT,start_date DATE,end_date DATE,status ENUM('Aktif','Berakhir') DEFAULT 'Aktif',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(transaction_id) REFERENCES transactions(id),FOREIGN KEY(laptop_id) REFERENCES laptop_units(id));
CREATE TABLE warranty_claims(id INT AUTO_INCREMENT PRIMARY KEY,warranty_id INT,complaint TEXT,sticker_condition ENUM('Terpasang','Terlepas'),human_error_indication ENUM('Ada','Tidak Ada','Perlu Pemeriksaan'),initial_notes TEXT,inspection_result TEXT,cause TEXT,action_taken TEXT,warranty_notes TEXT,decision ENUM('Belum Diputuskan','Diterima','Ditolak') DEFAULT 'Belum Diputuskan',status ENUM('Diajukan','Pemeriksaan','Diproses','Selesai','Ditolak') DEFAULT 'Diajukan',submitted_by INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,FOREIGN KEY(warranty_id) REFERENCES warranties(id),FOREIGN KEY(submitted_by) REFERENCES users(id));
CREATE TABLE warranty_histories(id INT AUTO_INCREMENT PRIMARY KEY,claim_id INT,status VARCHAR(50),notes TEXT,user_id INT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(claim_id) REFERENCES warranty_claims(id),FOREIGN KEY(user_id) REFERENCES users(id));
INSERT INTO roles(name) VALUES('OWNER'),('ADMIN'),('STAFF CABANG'),('PETUGAS WARRANTY');
INSERT INTO branches(name,city) VALUES('Cidodol','Jakarta'),('Ciledug','Tangerang'),('Meruya','Jakarta Barat'),('Pamulang','Tangerang Selatan'),('Cisauk','Tangerang'),('Bintaro','Tangerang Selatan');
INSERT INTO users(role_id,name,username,password,status) VALUES
(1,'Owner / Boss','boss','$2y$12$/6pINNrfl3lFFbnBDh9Z9.RARIe8Pn/vwvLjAm9GJCOrUvdSkWTeO','aktif'),(2,'Administrator','admin','$2y$12$vuLc4lN6GRa0HHw2pkdE5.wHWuyI3hwHR5lFa.3GhhqiNhly8bzrO','aktif'),(3,'Staff Cabang','staff','$2y$12$yU/2AHX36wfItpUwW9x.NuFMg1w//5oO8aiDq2YuZE3AIy0UYqqPy','aktif'),(4,'Petugas Warranty','warranty','$2y$12$9jBYYuPWFd5iCEwIfOw2Muc6U7vQkcMq5.m91OMuRSwesrSbeyszi','aktif');

-- 50 unit laptop: jumlah dan nama mengikuti daftar inventory yang diberikan.
INSERT INTO laptop_units(unit_code,product_name,brand,model,processor,ram,storage,storage_type,touchscreen,image_path,entry_date,sale_price,status) VALUES
('AL-001','LENOVO THINKPAD L14 I5-10310U 8/256 TOUCHSCREEN','Lenovo','ThinkPad L14','Intel Core i5-10310U','8 GB','256 GB','SSD','Ya','assets/products/lenovo.svg','2026-08-05',5500000,'Terjual'),
('AL-002','LENOVO THINKPAD L14 I5-10310U 8/256 TOUCHSCREEN','Lenovo','ThinkPad L14','Intel Core i5-10310U','8 GB','256 GB','SSD','Ya','assets/products/lenovo.svg','2026-08-06',5600000,'Tersedia'),
('AL-003','LENOVO THINKPAD L14 I5-10210U 16/256 NO TOUCHSCREEN','Lenovo','ThinkPad L14','Intel Core i5-10210U','16 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-08-07',5900000,'Terjual'),
('AL-004','LENOVO THINKPAD L14 I5-10210U 8/256 NO TOUCHSCREEN','Lenovo','ThinkPad L14','Intel Core i5-10210U','8 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-08-08',5450000,'Tersedia'),
('AL-005','LENOVO THINKPAD L14 I5-10210U 8/256 NO TOUCHSCREEN','Lenovo','ThinkPad L14','Intel Core i5-10210U','8 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-08-09',5450000,'Tersedia'),
('AL-006','LENOVO THINKPAD 8/256 I5-10310U 8/256 TOUCHSCREEN','Lenovo','ThinkPad','Intel Core i5-10310U','8 GB','256 GB','SSD','Ya','assets/products/lenovo.svg','2026-08-10',5400000,'Terjual'),
('AL-007','MICROSOFT SURFACE 1951 I5-1145G7 W11 8/512 TOUCHSCREEN','Microsoft','Surface 1951','Intel Core i5-1145G7','8 GB','512 GB','SSD','Ya','assets/products/microsoft.svg','2026-08-11',7200000,'Terjual'),
('AL-008','MICROSOFT SURFACE 1951 I5-1145G7 W11 8/512 TOUCHSCREEN','Microsoft','Surface 1951','Intel Core i5-1145G7','8 GB','512 GB','SSD','Ya','assets/products/microsoft.svg','2026-08-12',7200000,'Tersedia'),
('AL-009','LENOVO THINKPAD L13 YOGA I3-10110U 4/128 TOUCHSCREEN','Lenovo','ThinkPad L13 Yoga','Intel Core i3-10110U','4 GB','128 GB','SSD','Ya','assets/products/lenovo.svg','2026-08-13',4100000,'Terjual'),
('AL-010','LENOVO THINKPAD L13 YOGA I3-10110U 4/128 TOUCHSCREEN','Lenovo','ThinkPad L13 Yoga','Intel Core i3-10110U','4 GB','128 GB','SSD','Ya','assets/products/lenovo.svg','2026-08-14',4100000,'Tersedia'),
('AL-011','ACER TRAVELMATE P633 I5 GEN 3 4/HDD320 14INCH','Acer','TravelMate P633','Intel Core i5 Gen 3','4 GB','320 GB','HDD','Tidak','assets/products/acer.svg','2026-08-15',2600000,'Terjual'),
('AL-012','ACER TRAVELMATE P633 I5 GEN 3 4/HDD320 14INCH','Acer','TravelMate P633','Intel Core i5 Gen 3','4 GB','320 GB','HDD','Tidak','assets/products/acer.svg','2026-08-16',2600000,'Tersedia'),
('AL-013','ACER TRAVELMATE P633 I5 GEN 3 4/HDD320 14INCH','Acer','TravelMate P633','Intel Core i5 Gen 3','4 GB','320 GB','HDD','Tidak','assets/products/acer.svg','2026-08-17',2600000,'Tersedia'),
('AL-014','ACER TRAVELMATE P247M I3 GEN 5 4/128','Acer','TravelMate P247M','Intel Core i3 Gen 5','4 GB','128 GB','SSD','Tidak','assets/products/acer.svg','2026-08-18',2800000,'Terjual'),
('AL-015','ACER TRAVELMATE P247M I3 GEN 5 4/128','Acer','TravelMate P247M','Intel Core i3 Gen 5','4 GB','128 GB','SSD','Tidak','assets/products/acer.svg','2026-08-19',2800000,'Tersedia'),
('AL-016','ACER TRAVELMATE P247M I3 GEN 5 4/128','Acer','TravelMate P247M','Intel Core i3 Gen 5','4 GB','128 GB','SSD','Tidak','assets/products/acer.svg','2026-08-20',2800000,'Tersedia'),
('AL-017','LENOVO 300E CHROMEBOOK N4020 4/32','Lenovo','300E Chromebook','Intel Celeron N4020','4 GB','32 GB','SSD','Tidak','assets/products/lenovo.svg','2026-08-21',1800000,'Terjual'),
('AL-018','ZYREX BUNAKEN BLACK N4020 4/256','Zyrex','Bunaken Black','Intel Celeron N4020','4 GB','256 GB','SSD','Tidak','assets/products/zyrex.svg','2026-08-22',2450000,'Tersedia'),
('AL-019','LENOVO IDEAPAD 3 11ADA05 AMD REDEON GRAPHIC 4/256 GEN11','Lenovo','IdeaPad 3 11ADA05','AMD Radeon','4 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-08-23',3400000,'Terjual'),
('AL-020','LENOVO IDEAPAD 3 14/AU713 GEAN 12','Lenovo','IdeaPad 3 14','Intel Gen 12','8 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-08-24',5200000,'Tersedia'),
('AL-021','ADVAN CELERON N4020','Advan','Celeron N4020','Intel Celeron N4020','4 GB','128 GB','SSD','Tidak','assets/products/advan.svg','2026-08-25',2200000,'Tersedia'),
('AL-022','ADVAN WORKPRO 1710 LITE I3 GEN 12 8/256 FULLSET','Advan','Workpro 1710 Lite','Intel Core i3 Gen 12','8 GB','256 GB','SSD','Tidak','assets/products/advan.svg','2026-08-26',4800000,'Terjual'),
('AL-023','DELL LATITUDE E5720 I5 GEN 6 8/256','Dell','Latitude E5720','Intel Core i5 Gen 6','8 GB','256 GB','SSD','Tidak','assets/products/dell.svg','2026-08-27',3900000,'Tersedia'),
('AL-024','PC ALL IN ONE HAPPY GSR I7-3520M 8/256','PC','All In One Happy GSR','Intel Core i7-3520M','8 GB','256 GB','SSD','Tidak','assets/products/dell.svg','2026-08-28',3600000,'Tersedia'),
('AL-025','ACER ASPIRE AS1-432 CELERON N3350 6/256','Acer','Aspire AS1-432','Intel Celeron N3350','6 GB','256 GB','SSD','Tidak','assets/products/acer.svg','2026-08-29',2500000,'Tersedia'),
('AL-026','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-08-30',1900000,'Terjual'),
('AL-027','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-08-31',1900000,'Tersedia'),
('AL-028','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-01',1900000,'Tersedia'),
('AL-029','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-02',1900000,'Terjual'),
('AL-030','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-03',1900000,'Tersedia'),
('AL-031','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-04',1900000,'Tersedia'),
('AL-032','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-05',1900000,'Tersedia'),
('AL-033','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-06',1900000,'Terjual'),
('AL-034','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-07',1900000,'Tersedia'),
('AL-035','TOSHIBA DYNABOOK K50 N4020 4/64','Toshiba','Dynabook K50','Intel Celeron N4020','4 GB','64 GB','SSD','Tidak','assets/products/toshiba.svg','2026-09-08',1900000,'Tersedia'),
('AL-036','LENOVO THINKPAD L13 YOGA INTEL CORE I3-10110U 4/128 TOUCHSCREEN FLIP','Lenovo','ThinkPad L13 Yoga','Intel Core i3-10110U','4 GB','128 GB','SSD','Ya','assets/products/lenovo.svg','2026-09-09',4200000,'Terjual'),
('AL-037','LENOVO THINKPAD L13 YOGA INTEL CORE I3-10110U 4/128 TOUCHSCREEN FLIP','Lenovo','ThinkPad L13 Yoga','Intel Core i3-10110U','4 GB','128 GB','SSD','Ya','assets/products/lenovo.svg','2026-09-10',4200000,'Tersedia'),
('AL-038','LENOVO THINKPAD L13 YOGA INTEL CORE I3-10110U 4/128 TOUCHSCREEN FLIP','Lenovo','ThinkPad L13 Yoga','Intel Core i3-10110U','4 GB','128 GB','SSD','Ya','assets/products/lenovo.svg','2026-09-11',4200000,'Tersedia'),
('AL-039','INFINIX XBOOK I5 RAYZEN 5 5500 8/256','Infinix','XBook','Ryzen 5 5500','8 GB','256 GB','SSD','Tidak','assets/products/infinix.svg','2026-09-12',4900000,'Terjual'),
('AL-040','AXIOO HYPE 1 INTEL CELERON N4020 4/128','Axioo','Hype 1','Intel Celeron N4020','4 GB','128 GB','SSD','Tidak','assets/products/axioo.svg','2026-09-13',2400000,'Tersedia'),
('AL-041','AXIOO HYPE 1 INTEL CELERON N4020 4/128','Axioo','Hype 1','Intel Celeron N4020','4 GB','128 GB','SSD','Tidak','assets/products/axioo.svg','2026-09-14',2400000,'Tersedia'),
('AL-042','LENOVO D330 INTEL CELERON 4/SD 64GB','Lenovo','D330','Intel Celeron','4 GB','64 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-15',2300000,'Terjual'),
('AL-043','LENOVO D330 INTEL CELERON 4/SD 64GB','Lenovo','D330','Intel Celeron','4 GB','64 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-16',2300000,'Tersedia'),
('AL-044','LENOVO D330 INTEL CELERON 4/SD 64GB','Lenovo','D330','Intel Celeron','4 GB','64 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-17',2300000,'Tersedia'),
('AL-045','LENOVO D330 INTEL CELERON 4/SD 64GB','Lenovo','D330','Intel Celeron','4 GB','64 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-18',2300000,'Tersedia'),
('AL-046','LENOVO D330 INTEL CELERON 4/SD 64GB','Lenovo','D330','Intel Celeron','4 GB','64 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-19',2300000,'Tersedia'),
('AL-047','LENOVO THINKPAD X270 INTELCORE I5-6300U 8/256GB','Lenovo','ThinkPad X270','Intel Core i5-6300U','8 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-20',3600000,'Terjual'),
('AL-048','LENOVO THINKPAD X270 INTELCORE I5-6300U 8/256GB','Lenovo','ThinkPad X270','Intel Core i5-6300U','8 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-21',3600000,'Tersedia'),
('AL-049','DELL LATITUDE 7410 INTEL CORE I5-10310U 16/256GB','Dell','Latitude 7410','Intel Core i5-10310U','16 GB','256 GB','SSD','Tidak','assets/products/dell.svg','2026-09-22',5700000,'Terjual'),
('AL-050','LENOVO THINKPAD L14 I5-10210U 16/256 NO TOUCHSCREEN','Lenovo','ThinkPad L14','Intel Core i5-10210U','16 GB','256 GB','SSD','Tidak','assets/products/lenovo.svg','2026-09-23',5900000,'Tersedia');

INSERT INTO accessories(name,category,quantity,unit,status,notes) VALUES
('CABLE HDMI','Kabel',6,'pcs','Tersedia',''),('CABLE PORT ADAPTER HDMI TO VGA','Adapter',5,'pcs','Tersedia',''),('USB WIFI WIRELESS 300 MBPS','Networking',4,'pcs','Tersedia',''),('OBENG 4 PCS/SET','Peralatan',5,'set','Tersedia',''),('MOUSE CABLE MTECH MT-129','Mouse',8,'pcs','Tersedia',''),('MOUSE LOGITECH B175 WIRELESS','Mouse',9,'pcs','Tersedia',''),('MOUSEPAD HITAM POLOS','Mousepad',9,'pcs','Tersedia','');

-- Customer dan transaksi awal untuk menghidupkan grafik penjualan serta produk terlaris.
INSERT INTO customers(name,phone,address,first_transaction_date) VALUES
('Andi Saputra','081200000001','Jakarta','2026-09-02'),('Budi Santoso','081200000002','Tangerang','2026-09-05'),('Citra Lestari','081200000003','Jakarta Barat','2026-09-08'),('Dimas Pratama','081200000004','Tangerang Selatan','2026-09-12'),('Eka Putri','081200000005','Jakarta','2026-09-15'),('Fajar Nugraha','081200000006','Tangerang','2026-09-18'),('Gita Maharani','081200000007','Jakarta','2026-09-21'),('Hendra Wijaya','081200000008','Tangerang Selatan','2026-09-24');
INSERT INTO transactions(invoice_no,transaction_date,user_id,customer_id,branch_id,payment_method,total,notes,status) VALUES
('INV-20260902-0001','2026-09-02 10:15:00',3,1,1,'Tunai',5500000,'','Selesai'),
('INV-20260905-0002','2026-09-05 13:20:00',3,2,1,'Non Tunai',5900000,'','Selesai'),
('INV-20260908-0003','2026-09-08 15:10:00',3,3,1,'Tunai',5400000,'','Selesai'),
('INV-20260910-0004','2026-09-10 11:30:00',3,4,1,'Non Tunai',7200000,'','Selesai'),
('INV-20260912-0005','2026-09-12 16:45:00',3,5,1,'Tunai',4100000,'','Selesai'),
('INV-20260915-0006','2026-09-15 12:00:00',3,6,1,'Non Tunai',2600000,'','Selesai'),
('INV-20260917-0007','2026-09-17 14:35:00',3,7,1,'Tunai',2800000,'','Selesai'),
('INV-20260919-0008','2026-09-19 17:10:00',3,8,1,'Non Tunai',1800000,'','Selesai'),
('INV-20260920-0009','2026-09-20 10:40:00',3,1,1,'Tunai',3400000,'','Selesai'),
('INV-20260922-0010','2026-09-22 13:50:00',3,2,1,'Non Tunai',4800000,'','Selesai'),
('INV-20260923-0011','2026-09-23 15:20:00',3,3,1,'Tunai',1900000,'','Selesai'),
('INV-20260924-0012','2026-09-24 11:10:00',3,4,1,'Non Tunai',1900000,'','Selesai'),
('INV-20260925-0013','2026-09-25 14:00:00',3,5,1,'Tunai',1900000,'','Selesai'),
('INV-20260926-0014','2026-09-26 16:20:00',3,6,1,'Non Tunai',4200000,'','Selesai'),
('INV-20260927-0015','2026-09-27 12:10:00',3,7,1,'Tunai',4900000,'','Selesai'),
('INV-20260927-0016','2026-09-27 14:30:00',3,8,1,'Non Tunai',2300000,'','Selesai'),
('INV-20260927-0017','2026-09-27 15:05:00',3,1,1,'Tunai',3600000,'','Selesai'),
('INV-20260927-0018','2026-09-27 15:40:00',3,2,1,'Non Tunai',5700000,'','Selesai');
INSERT INTO transaction_details(transaction_id,laptop_id,price,quantity,subtotal) VALUES
(1,1,5500000,1,5500000),(2,3,5900000,1,5900000),(3,6,5400000,1,5400000),(4,7,7200000,1,7200000),(5,9,4100000,1,4100000),(6,11,2600000,1,2600000),(7,14,2800000,1,2800000),(8,17,1800000,1,1800000),(9,19,3400000,1,3400000),(10,22,4800000,1,4800000),(11,26,1900000,1,1900000),(12,29,1900000,1,1900000),(13,33,1900000,1,1900000),(14,36,4200000,1,4200000),(15,39,4900000,1,4900000),(16,42,2300000,1,2300000),(17,47,3600000,1,3600000),(18,49,5700000,1,5700000);
INSERT INTO warranties(transaction_id,laptop_id,start_date,end_date,status) SELECT id,(SELECT laptop_id FROM transaction_details WHERE transaction_id=transactions.id LIMIT 1),DATE(transaction_date),DATE_ADD(DATE(transaction_date),INTERVAL 1 MONTH),'Aktif' FROM transactions;

-- Ringkasan performa enam cabang untuk dashboard Owner.
INSERT INTO branch_sales(branch_id,period_month,total_sales,units_sold) VALUES
(1,'2026-09-01',73500000,18),(2,'2026-09-01',68400000,16),(3,'2026-09-01',61200000,14),(4,'2026-09-01',57900000,13),(5,'2026-09-01',48600000,11),(6,'2026-09-01',64200000,15),
(1,'2026-08-01',64800000,15),(2,'2026-08-01',60100000,14),(3,'2026-08-01',55300000,13),(4,'2026-08-01',52400000,12),(5,'2026-08-01',45100000,10),(6,'2026-08-01',58600000,13);
INSERT INTO notifications(user_id,title,message) VALUES(NULL,'Sistem aktif','Seluruh modul operasional siap digunakan.'),(1,'Ringkasan cabang','Laporan performa enam cabang tersedia pada Dashboard Owner.');
