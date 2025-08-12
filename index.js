// Dependens, important tools to use in the project.
const express = require("express");
const multer = require("multer");
const csv = require("csv-parser");
const fs = require("fs");
const path = require("path");
const pool = require("./src/config/mysql");

const app = express();
app.use(express.urlencoded({ extended: true }));

// Create uploads folder if it doesn't exist
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// Configuración de multer
const upload = multer({ dest: uploadDir });

// Map of the columns, here i can have the control of the entity's titles
const equivalencias = {
  "id_de_la_transaccion": "code",
  "fecha_y_hora_de_la_transaccion": "transaction_datetime",
  "monto_de_la_transaccion": "amount",
  "estado_de_la_transaccion": "transaction_status",
  "tipo_de_transaccion": "transaction_type",
  "nombre_del_cliente": "name_user",
  "numero_de_identificacion": "identification",
  "direccion": "address_user",
  "telefono": "phone_number",
  "correo_electronico": "email",
  "plataforma_utilizada": "platform_name",
  "numero_de_factura": "invoice_number",
  "periodo_de_facturacion": "billing_period",
  "monto_facturado": "amount_billed",
  "monto_pagado": "amount_paid"
};

// Map csv states
const statusMap = {
  "pendiente": "Pending",
  "completado": "Completed",
  "fallido": "Failed"
};

// Functions to format dates
function toDate(str) {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10); // outside  YYYY-MM-DD
}
function toDateTime(str) {
  if (!str) return null;
  const d = new Date(str);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 19).replace("T", " "); // outside YYYY-MM-DD HH:mm:ss
}

// The main page to upload the information
app.get("/", (req, res) => {
  res.send(`
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 p-6">
        <div class="max-w-lg mx-auto bg-white p-6 rounded shadow">
          <h2 class="text-xl font-bold mb-4">Subir CSV</h2>
          <form action="/upload" method="post" enctype="multipart/form-data" class="space-y-4">
            <input type="file" name="archivoCSV" class="block w-full border border-gray-300 rounded p-2" required />
            <button class="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600">Subir</button>
          </form>
          <a href="/table-view" class="block mt-4 text-blue-600 hover:underline">Ver datos</a>
        </div>
      </body>
    </html>
  `);
});

// Process csv and save it in to Mysql
app.post("/upload", upload.single("archivoCSV"), async (req, res) => {
  const rows = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => rows.push(data))
    .on("end", async () => {
      try {
        for (let r of rows) {
          const obj = {};
          for (let key in r) {
            const normal = key
              .trim()
              .toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
              .replace(/\s+/g, "_");
            if (equivalencias[normal]) obj[equivalencias[normal]] = r[key];
          }

        // Here i check that the object exist, if it doesn't exist , then, continue
          if (!obj.identification) continue;

          obj.billing_period = toDate(obj.billing_period);
          obj.transaction_datetime = toDateTime(obj.transaction_datetime);

          if (obj.transaction_status) {
            obj.transaction_status = statusMap[obj.transaction_status.trim().toLowerCase()] || "Pending";
          }

          let [client] = await pool.query("SELECT id_client FROM clients WHERE identification = ?", [obj.identification]);
          if (!client.length) {
            let result = await pool.query(
              "INSERT INTO clients (name_user, identification, address_user, phone_number, email) VALUES (?, ?, ?, ?, ?)",
              [obj.name_user, obj.identification, obj.address_user, obj.phone_number, obj.email]
            );
            obj.id_client = result[0].insertId;
          } else obj.id_client = client[0].id_client;

          let [platform] = await pool.query("SELECT id_platform FROM platforms WHERE platform_name = ?", [obj.platform_name]);
          if (!platform.length) {
            let result = await pool.query("INSERT INTO platforms (platform_name) VALUES (?)", [obj.platform_name]);
            obj.id_platform = result[0].insertId;
          } else obj.id_platform = platform[0].id_platform;

          let [invoice] = await pool.query("SELECT id_invoice FROM invoices WHERE invoice_number = ?", [obj.invoice_number]);
          if (!invoice.length) {
            let result = await pool.query(
              "INSERT INTO invoices (invoice_number, billing_period, amount_billed, id_client) VALUES (?, ?, ?, ?)",
              [obj.invoice_number, obj.billing_period, obj.amount_billed, obj.id_client]
            );
            obj.id_invoice = result[0].insertId;
          } else obj.id_invoice = invoice[0].id_invoice;

          await pool.query(
            "INSERT INTO transactions (code, transaction_datetime, amount, transaction_status, transaction_type, amount_paid, id_invoice, id_platform) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [obj.code, obj.transaction_datetime, obj.amount, obj.transaction_status, obj.transaction_type, obj.amount_paid, obj.id_invoice, obj.id_platform]
          );
        }
        fs.unlinkSync(req.file.path);
        res.send("CSV procesado con éxito");
      } catch (err) {
        console.error("Error procesando CSV:", err);
        res.status(500).send("Error procesando CSV: " + err.message);
      }
    });
});

// This is the view with Taildwind to render the datas
app.get("/table-view", async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.id_transaction, c.name_user, c.identification, c.email, p.platform_name, i.invoice_number, t.amount
    FROM transactions t
    JOIN invoices i ON t.id_invoice = i.id_invoice
    JOIN clients c ON i.id_client = c.id_client
    JOIN platforms p ON t.id_platform = p.id_platform
  `);
  let html = `
    <html>
      <head>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body class="bg-gray-100 p-6">
        <div class="max-w-6xl mx-auto bg-white p-6 rounded shadow">
          <h1 class="text-2xl font-bold mb-4">Lista de Transacciones</h1>
          <table class="table-auto w-full border-collapse border border-gray-300">
            <thead class="bg-gray-200">
              <tr>
                <th class="border px-4 py-2">ID</th>
                <th class="border px-4 py-2">Cliente</th>
                <th class="border px-4 py-2">Identificación</th>
                <th class="border px-4 py-2">Email</th>
                <th class="border px-4 py-2">Plataforma</th>
                <th class="border px-4 py-2">Factura</th>
                <th class="border px-4 py-2">Monto</th>
                <th class="border px-4 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
  `;
  rows.forEach(r => {
    //Here i add dinamic content to the HTML 
    html += `
      <tr>
        <td class="border px-4 py-2">${r.id_transaction}</td>
        <td class="border px-4 py-2">${r.name_user}</td>
        <td class="border px-4 py-2">${r.identification}</td>
        <td class="border px-4 py-2">${r.email}</td>
        <td class="border px-4 py-2">${r.platform_name}</td>
        <td class="border px-4 py-2">${r.invoice_number}</td>
        <td class="border px-4 py-2">${r.amount}</td>
        <td class="border px-4 py-2">
          <a href="/update/${r.id_transaction}" class="bg-yellow-500 text-white px-2 py-1 rounded">Editar</a>
          <a href="/delete/${r.id_transaction}" class="bg-red-500 text-white px-2 py-1 rounded" onclick="return confirm('¿Seguro que deseas eliminar?')">Eliminar</a>
        </td>
      </tr>
    `;
  });
  html += `
            </tbody>
          </table>
          <a href="/" class="mt-4 inline-block text-blue-600 hover:underline">⬅ Volver</a>
        </div>
      </body>
    </html>
  `;
  res.send(html);
});

// Delete register
app.get("/delete/:id", async (req, res) => {
  await pool.query("DELETE FROM transactions WHERE id_transaction = ?", [req.params.id]);
  res.redirect("/table-view");
});

// Form for update each register
app.get("/update/:id", async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.*, c.name_user, c.identification, c.address_user, c.phone_number, c.email,
           p.platform_name,
           i.invoice_number, i.billing_period, i.amount_billed
    FROM transactions t
    JOIN invoices i ON t.id_invoice = i.id_invoice
    JOIN clients c ON i.id_client = c.id_client
    JOIN platforms p ON t.id_platform = p.id_platform
    WHERE t.id_transaction = ?
  `, [req.params.id]);

  if (!rows.length) return res.send("Registro no encontrado");
  const r = rows[0];
// Here this content will be render on the page
  res.send(`
    <html>
      <head><script src="https://cdn.tailwindcss.com"></script></head>
      <body class="bg-gray-100 p-6">
        <div class="max-w-xl mx-auto bg-white p-6 rounded shadow">
          <h2 class="text-xl font-bold mb-4">Editar Transacción</h2>
          <form action="/update/${r.id_transaction}" method="post" class="space-y-4">
            <input type="text" name="name_user" value="${r.name_user}" class="border p-2 w-full" placeholder="Nombre cliente" />
            <input type="text" name="identification" value="${r.identification}" class="border p-2 w-full" placeholder="Identificación" />
            <input type="text" name="address_user" value="${r.address_user}" class="border p-2 w-full" placeholder="Dirección" />
            <input type="text" name="phone_number" value="${r.phone_number}" class="border p-2 w-full" placeholder="Teléfono" />
            <input type="text" name="email" value="${r.email}" class="border p-2 w-full" placeholder="Email" />
            <input type="text" name="platform_name" value="${r.platform_name}" class="border p-2 w-full" placeholder="Plataforma" />
            <input type="text" name="invoice_number" value="${r.invoice_number}" class="border p-2 w-full" placeholder="Factura" />
            <input type="date" name="billing_period" value="${r.billing_period ? r.billing_period.toISOString().slice(0,10) : ''}" class="border p-2 w-full" />
            <input type="number" step="0.01" name="amount_billed" value="${r.amount_billed}" class="border p-2 w-full" placeholder="Monto facturado" />
            <input type="text" name="code" value="${r.code}" class="border p-2 w-full" placeholder="Código transacción" />
            <input type="datetime-local" name="transaction_datetime" value="${r.transaction_datetime ? r.transaction_datetime.toISOString().slice(0,16) : ''}" class="border p-2 w-full" />
            <input type="number" step="0.01" name="amount" value="${r.amount}" class="border p-2 w-full" placeholder="Monto" />
            <input type="text" name="transaction_status" value="${r.transaction_status}" class="border p-2 w-full" placeholder="Estado" />
            <input type="text" name="transaction_type" value="${r.transaction_type}" class="border p-2 w-full" placeholder="Tipo transacción" />
            <input type="number" step="0.01" name="amount_paid" value="${r.amount_paid}" class="border p-2 w-full" placeholder="Monto pagado" />
            <button class="bg-green-500 text-white px-4 py-2 rounded">Guardar</button>
          </form>
        </div>
      </body>
    </html>
  `);
});


// Save changes
app.post("/update/:id", async (req, res) => {
  const {
    name_user, identification, address_user, phone_number, email,
    platform_name, invoice_number, billing_period, amount_billed,
    code, transaction_datetime, amount, transaction_status, transaction_type, amount_paid
  } = req.body;

  try {
    // Ge the id related with the transactions
    const [[ids]] = await pool.query(`
      SELECT t.id_invoice, t.id_platform, i.id_client
      FROM transactions t
      JOIN invoices i ON t.id_invoice = i.id_invoice
      WHERE t.id_transaction = ?
    `, [req.params.id]);

    if (!ids) {
      return res.status(404).send("Transacción no encontrada");
    }

    console.log("Actualizando transacción ID:", req.params.id);
    console.log("Datos recibidos:", req.body);
    console.log("IDs relacionados:", ids);

    // Update client
    const [clientUpdate] = await pool.query(`
      UPDATE clients SET name_user=?, identification=?, address_user=?, phone_number=?, email=?
      WHERE id_client=?
    `, [name_user, identification, address_user, phone_number, email, ids.id_client]);
    console.log("Clientes actualizados:", clientUpdate.affectedRows);

    // update Platform
    const [platformUpdate] = await pool.query(`
      UPDATE platforms SET platform_name=?
      WHERE id_platform=?
    `, [platform_name, ids.id_platform]);
    console.log("Plataformas actualizadas:", platformUpdate.affectedRows);

    // Update invoices
    const [invoiceUpdate] = await pool.query(`
      UPDATE invoices SET invoice_number=?, billing_period=?, amount_billed=?
      WHERE id_invoice=?
    `, [invoice_number, billing_period || null, amount_billed || 0, ids.id_invoice]);
    console.log("Facturas actualizadas:", invoiceUpdate.affectedRows);

    // Update transaction
    const [transactionUpdate] = await pool.query(`
      UPDATE transactions
      SET code=?, transaction_datetime=?, amount=?, transaction_status=?, transaction_type=?, amount_paid=?
      WHERE id_transaction=?
    `, [
      code,
      transaction_datetime ? new Date(transaction_datetime) : null,
      amount || 0,
      transaction_status,
      transaction_type,
      amount_paid || 0,
      req.params.id
    ]);
    console.log("Transacciones actualizadas:", transactionUpdate.affectedRows);

    res.redirect("/table-view");
  } catch (err) {
    console.error("Error al actualizar:", err);
    res.status(500).send("Error al actualizar registro");
  }
});

// Easy way to go to the page  --> http://localhost:3000
app.listen(3000, () => console.log("Servidor en http://localhost:3000"));
