// --- CONFIGURATION ---
const SUPABASE_URL = "https://wezopvfoqsmwcsogkhqh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlem9wdmZvcXNtd2Nzb2draHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjAzNzcsImV4cCI6MjEwMzY5NjM3N30.Pg9GUsQKI-ylL8RdCrNCE39tbWslDMt7JTuTQrArCAI";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. Initial Load - Pantry Items
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

// 2. Add New Pantry Item
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

// 3. Increment/Decrement Stock
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

// 4. Modal Handlers (Reorder, Order New, Edit)
function openOrderModal(itemId, itemName) {
  document.getElementById('modalOrderId').value = "";
  document.getElementById('modalItemId').value = itemId;
  document.getElementById('modalItemName').value = itemName;
  document.getElementById('modalItemName').disabled = true; // locked to existing item
  document.getElementById('modalTitle').innerText = `Reorder: ${itemName}`;
  document.getElementById('modalOrderQty').value = "1";
  document.getElementById('orderModal').style.display = "flex";
}

function openNewOrderModal() {
  document.getElementById('modalOrderId').value = "";
  document.getElementById('modalItemId').value = "";
  document.getElementById('modalItemName').value = "";
  document.getElementById('modalItemName').disabled = false; // editable for brand new item
  document.getElementById('modalTitle').innerText = "+ Order New Item";
  document.getElementById('modalOrderQty').value = "1";
  document.getElementById('orderModal').style.display = "flex";
}

function openEditOrderModal(orderId, itemId, currentFullName, currentQty) {
  document.getElementById('modalOrderId').value = orderId;
  document.getElementById('modalItemId').value = itemId || "";
  
  // Extract base name if contains package format
  const match = currentFullName.match(/^(.*?)\s*\(/);
  const baseName = match ? match[1] : currentFullName;

  document.getElementById('modalItemName').value = baseName;
  document.getElementById('modalItemName').disabled = !!itemId;
  document.getElementById('modalTitle').innerText = `Edit: ${baseName}`;
  document.getElementById('modalOrderQty').value = currentQty;
  document.getElementById('orderModal').style.display = "flex";
}

function closeOrderModal() {
  document.getElementById('orderModal').style.display = "none";
}

async function submitVendorOrder() {
  const orderId = document.getElementById('modalOrderId').value;
  const itemId = document.getElementById('modalItemId').value || null;
  const itemName = document.getElementById('modalItemName').value.trim();
  const orderQty = parseInt(document.getElementById('modalOrderQty').value);
  const unit = document.getElementById('modalOrderUnit').value;

  if (!itemName) return alert("Please enter an item name.");
  if (isNaN(orderQty) || orderQty <= 0) return alert("Please enter a valid quantity.");

  const formattedName = `${itemName} (${orderQty} ${unit})`;

  if (orderId) {
    // Edit existing order
    await supabaseClient.from('vendor_order_list').update({
      item_name: formattedName,
      order_qty: orderQty
    }).eq('id', orderId);
  } else {
    // Insert new order
    await supabaseClient.from('vendor_order_list').insert([{
      item_id: itemId,
      item_name: formattedName,
      order_qty: orderQty,
      status: 'pending'
    }]);
  }

  closeOrderModal();
  loadVendorList();
}

// 5. Vendor Reorder List
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
    <div class="vendor-row">
      <div>
        <strong>${order.item_name}</strong>
        <div style="font-size: 11px; color: #94a3b8;">Added: ${new Date(order.added_at).toLocaleDateString()}</div>
      </div>
      <div class="vendor-actions">
        <button class="btn btn-received" onclick="markAsReceived('${order.id}', '${order.item_id}', '${order.item_name}')">✓ Received</button>
        <button class="btn" onclick="openEditOrderModal('${order.id}', '${order.item_id || ''}', '${order.item_name}', ${order.order_qty})">✏️ Edit</button>
        <button class="btn btn-delete" onclick="removeFromVendorList('${order.id}')">🗑</button>
      </div>
    </div>
  `).join('');
}

// 6. Handle "Received" Items (Updates inventory stock directly)
async function markAsReceived(orderId, itemId, fullItemName) {
  const match = fullItemName.match(/^(.*?)\s*\(/);
  const baseName = match ? match[1].trim() : fullItemName.trim();

  const input = prompt(`Delivery arrived for "${baseName}"!\nHow many individual units arrived in total to add to inventory?`, "24");
  if (input === null) return;

  const receivedCount = parseInt(input);
  if (isNaN(receivedCount) || receivedCount < 0) return alert("Please enter a valid number.");

  if (itemId && itemId !== "null" && itemId !== "undefined") {
    // Item already existed in pantry: update its quantity
    const { data: existing } = await supabaseClient.from('pantry_items').select('current_qty').eq('id', itemId).single();
    if (existing) {
      await supabaseClient.from('pantry_items').update({ current_qty: existing.current_qty + receivedCount }).eq('id', itemId);
    }
  } else {
    // Brand new item: create a new pantry record
    const thresholdInput = prompt(`Set minimum alert threshold for new item "${baseName}":`, "5");
    const threshold = parseInt(thresholdInput) || 5;

    await supabaseClient.from('pantry_items').insert([{
      name: baseName,
      current_qty: receivedCount,
      threshold_qty: threshold
    }]);
  }

  // Remove from pending vendor list
  await supabaseClient.from('vendor_order_list').delete().eq('id', orderId);

  alert(`Added ${receivedCount} units of ${baseName} to inventory and cleared from vendor list!`);
  loadPantry();
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

// 7. Clipboard and PDF Export
async function copyVendorList() {
  const { data: orders } = await supabaseClient.from('vendor_order_list').select('*').eq('status', 'pending');
  if (!orders || orders.length === 0) return alert('Vendor list is empty.');

  const text = "DERIV PANTRY - VENDOR ORDER LIST\n\n" + orders.map(o => `• ${o.item_name}`).join('\n');
  navigator.clipboard.writeText(text);
  alert('Copied vendor list to clipboard!');
}

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
