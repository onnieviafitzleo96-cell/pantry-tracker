// --- CONFIGURATION ---
const SUPABASE_URL = "https://wezopvfoqsmwcsogkhqh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlem9wdmZvcXNtd2Nzb2draHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjAzNzcsImV4cCI6MjEwMzY5NjM3N30.Pg9GUsQKI-ylL8RdCrNCE39tbWslDMt7JTuTQrArCAI";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 1. Initial Load - Table View
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
      container.innerHTML = '<p style="color: #64748b; padding: 12px 0;">No items in pantry. Add your first item above!</p>';
      loadVendorList();
      return;
    }

    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Item Name</th>
            <th>Date Added</th>
            <th>Stock Left</th>
            <th>Alert Threshold</th>
            <th>Adjust Quantity</th>
            <th style="text-align: right;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => {
            const isLow = item.current_qty <= item.threshold_qty;
            const dateAdded = item.created_at ? new Date(item.created_at).toLocaleDateString() : 'N/A';

            return `
              <tr class="${isLow ? 'low-stock-row' : ''}">
                <td>
                  <strong>${item.name}</strong>
                  ${isLow ? '<span class="badge-low">REORDER</span>' : ''}
                </td>
                <td style="color: #64748b;">${dateAdded}</td>
                <td>
                  <strong style="font-size: 16px; color: ${isLow ? '#dc2626' : '#0f172a'};">${item.current_qty}</strong>
                </td>
                <td style="color: #64748b;">${item.threshold_qty}</td>
                <td>
                  <div style="display: flex; gap: 6px; align-items: center;">
                    <button class="qty-btn" type="button" title="Remove" onclick="promptQuantityUpdate('${item.id}', '${item.name}', ${item.current_qty}, 'minus')">-</button>
                    <button class="qty-btn" type="button" title="Add" onclick="promptQuantityUpdate('${item.id}', '${item.name}', ${item.current_qty}, 'add')">+</button>
                  </div>
                </td>
                <td style="text-align: right;">
                  <div style="display: flex; gap: 8px; justify-content: flex-end; align-items: center;">
                    ${isLow ? `
                      <button class="btn btn-reorder" type="button" onclick="promptVendorOrder('${item.id}', '${item.name}')">
                        + Add to Vendor List
                      </button>
                    ` : ''}
                    <button class="btn btn-delete" type="button" onclick="deleteItem('${item.id}', '${item.name}')">Delete</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    loadVendorList();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<p style="color: red;">Error connecting to database: ${err.message || 'Check console'}</p>`;
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
    alert("Error adding item: " + error.message);
  } else {
    document.getElementById('addForm').reset();
    loadPantry();
  }
});

// 3. Pop-up input to subtract or add quantity
async function promptQuantityUpdate(id, name, currentQty, type) {
  const actionText = type === 'minus' ? 'REMOVE / CONSUME from' : 'ADD to';
  const input = prompt(`How many units do you want to ${actionText} "${name}"?`, "1");
  
  if (input === null) return;
  const count = parseInt(input);

  if (isNaN(count) || count <= 0) {
    alert("Please enter a valid positive number.");
    return;
  }

  const newQty = type === 'minus' ? Math.max(0, currentQty - count) : currentQty + count;

  const { error } = await supabaseClient
    .from('pantry_items')
    .update({ current_qty: newQty })
    .eq('id', id);

  if (error) {
    alert("Error updating quantity: " + error.message);
  } else {
    loadPantry();
  }
}

// 4. Pop-up input to reorder items for vendor list
async function promptVendorOrder(itemId, itemName) {
  const input = prompt(`How many units of "${itemName}" should be ordered next month?`, "24");
  if (input === null) return;

  const orderQty = parseInt(input);
  if (isNaN(orderQty) || orderQty <= 0) {
    alert("Please enter a valid quantity.");
    return;
  }

  const { error } = await supabaseClient.from('vendor_order_list').insert([{
    item_id: itemId,
    item_name: itemName,
    order_qty: orderQty,
    status: 'pending'
  }]);

  if (error) {
    alert("Error adding to vendor list: " + error.message);
  } else {
    alert(`Added ${orderQty}x ${itemName} to Next Month's Vendor List.`);
    loadVendorList();
  }
}

// 5. Render Vendor Order Table
async function loadVendorList() {
  const wrapper = document.getElementById('vendorTableWrapper');
  if (!wrapper) return;

  const { data: orders, error } = await supabaseClient
    .from('vendor_order_list')
    .select('*')
    .eq('status', 'pending')
    .order('added_at', { ascending: false });

  if (error || !orders || orders.length === 0) {
    wrapper.innerHTML = '<p style="color: #64748b; padding: 12px 0;">No items marked for vendor reorder yet.</p>';
    return;
  }

  wrapper.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Item Name</th>
          <th>Order Quantity</th>
          <th>Date Added</th>
          <th style="text-align: right;">Action</th>
        </tr>
      </thead>
      <tbody>
        ${orders.map(order => `
          <tr>
            <td><strong>${order.item_name}</strong></td>
            <td><strong>${order.order_qty}</strong> units</td>
            <td style="color: #64748b;">${new Date(order.added_at).toLocaleDateString()}</td>
            <td style="text-align: right;">
              <button class="btn btn-delete" onclick="removeFromVendorList('${order.id}')">Remove</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

// 6. Delete Functions
async function removeFromVendorList(id) {
  await supabaseClient.from('vendor_order_list').delete().eq('id', id);
  loadVendorList();
}

async function deleteItem(id, name) {
  if (!confirm(`Delete "${name}" entirely from pantry?`)) return;
  await supabaseClient.from('pantry_items').delete().eq('id', id);
  loadPantry();
}

// 7. Copy Text to Clipboard
async function copyVendorList() {
  const { data: orders } = await supabaseClient.from('vendor_order_list').select('*').eq('status', 'pending');
  if (!orders || orders.length === 0) return alert('Vendor list is empty.');

  const text = "DERIV PANTRY - NEXT MONTH VENDOR REORDER LIST\n\n" + 
    orders.map(o => `• ${o.item_name}: ${o.order_qty} units`).join('\n');
    
  navigator.clipboard.writeText(text);
  alert('Reorder list copied to clipboard!');
}

// 8. Download PDF with jsPDF
async function downloadVendorPDF() {
  const { data: orders } = await supabaseClient.from('vendor_order_list').select('*').eq('status', 'pending');
  if (!orders || orders.length === 0) return alert('No items to export to PDF.');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Deriv Pantry - Vendor Order List", 14, 20);
  
  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 28);

  const tableRows = orders.map((o, index) => [
    index + 1,
    o.item_name,
    `${o.order_qty} units`,
    new Date(o.added_at).toLocaleDateString()
  ]);

  doc.autoTable({
    startY: 34,
    head: [['#', 'Item Name', 'Quantity to Order', 'Request Date']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
    styles: { fontSize: 11 }
  });

  doc.save(`Deriv_Pantry_Order_${new Date().toISOString().slice(0,10)}.pdf`);
}

// Run on page start
loadPantry();
