// --- CONFIGURATION ---
const SUPABASE_URL = "https://wezopvfoqsmwcsogkhqh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlem9wdmZvcXNtd2Nzb2draHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjAzNzcsImV4cCI6MjEwMzY5NjM3N30.Pg9GUsQKI-ylL8RdCrNCE39tbWslDMt7JTuTQrArCAI";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. Initial Load - Mobile Card/List
async function loadPantry() {
  const container = document.getElementById('pantryContainer');
  if (!container) return;
  
  try {
    const { data: items, error } = await supabaseClient
      .from('pantry_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!items || items.length === 0) {
      container.innerHTML = '<p style="color: #64748b; font-size: 14px;">No items in pantry. Add one above!</p>';
      loadVendorList();
      return;
    }

    container.innerHTML = items.map(item => {
      const isLow = item.current_qty <= item.threshold_qty;
      const dateAdded = item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A';

      return `
        <div class="item-row ${isLow ? 'low-stock' : ''}">
          <div class="item-header">
            <strong>${item.name}</strong>
            ${isLow ? '<span class="badge-low">LOW STOCK</span>' : ''}
          </div>
          
          <div class="item-details">
            <div>
              Stock: <span class="stock-highlight" style="color: ${isLow ? '#dc2626' : '#0f172a'};">${item.current_qty}</span>
              <span style="font-size: 11px;">(Min: ${item.threshold_qty})</span>
              <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Added: ${dateAdded}</div>
            </div>

            <div class="qty-controls">
              <button class="qty-btn" type="button" onclick="promptQuantityUpdate('${item.id}', '${item.name}', ${item.current_qty}, 'minus')">-</button>
              <button class="qty-btn" type="button" onclick="promptQuantityUpdate('${item.id}', '${item.name}', ${item.current_qty}, 'add')">+</button>
              <button class="btn btn-delete" type="button" onclick="deleteItem('${item.id}', '${item.name}')">🗑</button>
            </div>
          </div>

          ${isLow ? `
            <button class="btn-reorder" type="button" onclick="openOrderModal('${item.id}', '${item.name}')">
              + Add to Vendor Reorder List
            </button>
          ` : ''}
        </div>
      `;
    }).join('');

    loadVendorList();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color: red; font-size: 13px;">Error: ${err.message || 'Check connection'}</p>`;
  }
}

// 2. Add Item
document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value.trim();
  const current_qty = parseInt(document.getElementById('qty').value);
  const threshold_qty = parseInt(document.getElementById('threshold').value);

  const { error } = await supabaseClient
    .from('pantry_items')
    .insert([{ name, current_qty, threshold_qty }]);

  if (error) {
    alert("Error: " + error.message);
  } else {
    document.getElementById('addForm').reset();
    loadPantry();
  }
});

// 3. Quick +/- Quantity Prompt
async function promptQuantityUpdate(id, name, currentQty, type) {
  const actionText = type === 'minus' ? 'TAKE OUT / CONSUME from' : 'ADD to';
  const input = prompt(`How many units to ${actionText} "${name}"?`, "1");
  if (input === null) return;

  const count = parseInt(input);
  if (isNaN(count) || count <= 0) return alert("Please enter a valid positive number.");

  const newQty = type === 'minus' ? Math.max(0, currentQty - count) : currentQty + count;

  await supabaseClient.from('pantry_items').update({ current_qty: newQty }).eq('id', id);
  loadPantry();
}

// 4. Modal Flow for Pack / Carton Vendor Order
function openOrderModal(id, name) {
  document.getElementById('modalItemId').value = id;
  document.getElementById('modalItemName').value = name;
  document.getElementById('modalItemTitle').innerText = `Reorder: ${name}`;
  document.getElementById('modalOrderQty').value = "1";
  document.getElementById('orderModal').style.display = "flex";
}

function closeOrderModal() {
  document.getElementById('orderModal').style.display = "none";
}

async function submitVendorOrder() {
  const itemId = document.getElementById('modalItemId').value;
  const itemName = document.getElementById('modalItemName').value;
  const orderQty = parseInt(document.getElementById('modalOrderQty').value);
  const unit = document.getElementById('modalOrderUnit').value;

  if (isNaN(orderQty) || orderQty <= 0) return alert("Enter a valid quantity");

  const formattedName = `${itemName} (${orderQty} ${unit})`;

  const { error } = await supabaseClient.from('vendor_order_list').insert([{
    item_id: itemId,
    item_name: formattedName,
    order_qty: orderQty,
    status: 'pending'
  }]);

  if (error) {
    alert("Error adding item: " + error.message);
  } else {
    closeOrderModal();
    loadVendorList();
  }
}

// 5. Vendor Reorder List Render
async function loadVendorList() {
  const wrapper = document.getElementById('vendorTableWrapper');
  if (!wrapper) return;

  const { data: orders } = await supabaseClient
    .from('vendor_order_list')
    .select('*')
    .eq('status', 'pending')
    .order('added_at', { ascending: false });

  if (!orders || orders.length === 0) {
    wrapper.innerHTML = '<p style="color: #64748b; font-size: 13px;">No items marked for vendor reorder yet.</p>';
    return;
  }

  wrapper.innerHTML = orders.map(order => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #e2e8f0; font-size: 14px;">
      <div>
        <strong>${order.item_name}</strong>
        <div style="font-size: 11px; color: #94a3b8;">Added: ${new Date(order.added_at).toLocaleDateString()}</div>
      </div>
      <button class="btn btn-delete" onclick="removeFromVendorList('${order.id}')">Remove</button>
    </div>
  `).join('');
}

async function removeFromVendorList(id) {
  await supabaseClient.from('vendor_order_list').delete().eq('id', id);
  loadVendorList();
}

async function deleteItem(id, name) {
  if (!confirm(`Delete "${name}" from pantry?`)) return;
  await supabaseClient.from('pantry_items').delete().eq('id', id);
  loadPantry();
}

// 6. Export List to Clipboard
async function copyVendorList() {
  const { data: orders } = await supabaseClient.from('vendor_order_list').select('*').eq('status', 'pending');
  if (!orders || orders.length === 0) return alert('Vendor list is empty.');

  const text = "DERIV PANTRY - VENDOR ORDER LIST\n\n" + orders.map(o => `• ${o.item_name}`).join('\n');
  navigator.clipboard.writeText(text);
  alert('Copied vendor list to clipboard!');
}

// 7. Export List to PDF
async function downloadVendorPDF() {
  const { data: orders } = await supabaseClient.from('vendor_order_list').select('*').eq('status', 'pending');
  if (!orders || orders.length === 0) return alert('No items to export.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Deriv Pantry - Vendor Order List", 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 26);

  const tableRows = orders.map((o, idx) => [
    idx + 1,
    o.item_name,
    new Date(o.added_at).toLocaleDateString()
  ]);

  doc.autoTable({
    startY: 32,
    head: [['#', 'Item & Package Quantity', 'Date Added']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 11 }
  });

  doc.save(`Deriv_Pantry_Order_${new Date().toISOString().slice(0,10)}.pdf`);
}

loadPantry();
