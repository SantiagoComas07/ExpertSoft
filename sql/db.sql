
-- To use database -- clever cloud
USE bzfoh65jxj8hok4wud7j;

-- Clients table
CREATE TABLE clients (
    id_client INT AUTO_INCREMENT PRIMARY KEY,
    name_user VARCHAR(100) NOT NULL,
    identification VARCHAR(20) UNIQUE NOT NULL,
    address_user VARCHAR(255),
    phone_number VARCHAR(30),
    email VARCHAR(100)
);

-- Platforms table
CREATE TABLE platforms (
    id_platform INT AUTO_INCREMENT PRIMARY KEY,
    platform_name VARCHAR(50) UNIQUE NOT NULL
);

-- invoices table
CREATE TABLE invoices (
    id_invoice INT AUTO_INCREMENT PRIMARY KEY,
    invoice_number VARCHAR(20) UNIQUE NOT NULL,
    billing_period DATE NOT NULL,
    amount_billed DECIMAL(12,2) NOT NULL,
    id_client INT NOT NULL,
    FOREIGN KEY (id_client) REFERENCES clients(id_client)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- transactions table
CREATE TABLE transactions (
    id_transaction INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(20) NOT NULL,
    transaction_datetime DATETIME NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    transaction_status ENUM('Pending','Completed','Failed') NOT NULL DEFAULT 'Pending',
    transaction_type VARCHAR(50),
    amount_paid DECIMAL(12,2) DEFAULT 0,
    id_invoice INT NOT NULL,
    id_platform INT NOT NULL,
    FOREIGN KEY (id_invoice) REFERENCES invoices(id_invoice)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    FOREIGN KEY (id_platform) REFERENCES platforms(id_platform)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);