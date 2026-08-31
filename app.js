const SUPABASE_URL = "https://wezopvfoqsmwcsogkhqh.supabase.co/rest/v1/";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indlem9wdmZvcXNtd2Nzb2draHFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgxMjAzNzcsImV4cCI6MjEwMzY5NjM3N30.Pg9GUsQKI-ylL8RdCrNCE39tbWslDMt7JTuTQrArCAI";
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function loadPantry() {
  const { data: items, error } = await supabase.from('pantry_items').select('*').order('name');
  if (error) return console.error(error);

  const grid = document.getElementById('pantryGrid');
  grid.innerHTML = items.map(item => {
    const isLow = item.current_qty <= item.threshold_qty;
    return `
      <div class="card ${isLow ? 'low-stock' : ''}">
        <div class="flex-between">
          <h3 style="margin: 0;">${item.name}</h3>
          ${isLow ? '<span class="badge badge-danger">Low Stock</span>' : ''}
        </div>
        <p style="color: #64748b; font-size: 14px;">Stock: <strong>${item.current_qty}</strong> / Min: ${item.threshold_qty} ${item.unit}</p>
        
        <div style="display: flex; gap: 8px; align-items: center; margin: 12px 0;">
          <button class="btn btn-qty" onclick="updateQty('${item.id}', ${item.current_qty - 1})">-</button>
          <span>Adjust Stock</span>
          <button class="btn btn-qty" onclick="updateQty('${item.id}', ${item.current_qty + 1})">+</button>
        </div>

        <div style="font-size: 13px; color: #475569;">
          <label>
            <input type="checkbox" ${item.is_opened ? 'checked' : ''} onchange="toggleOpened('${item.id}', this.checked)">
            ${item.is_opened ? 'Opened on ' + new Date(item.opened_at).toLocaleDateString() : 'Mark as Opened'}
          </label>
        </div>

        ${isLow ? `
          <button class="btn btn-order" onclick="addToVendorList('${item.id}', '${item.name}', ${item.threshold_qty * 2})">
            + Add to Next Month's List
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  loadVendorList();
}

async function updateQty(id, newQty) {
  if (newQty < 0) return;
  await supabase.from('pantry_items').update({ current_qty: newQty }).eq('id', id);
  loadPantry();
}

async function toggleOpened(id, isOpened) {
  await supabase.from('pantry_items').update({
    is_opened: isOpened,
    opened_at: isOpened ? new Date().toISOString() : null
  }).eq('id', id);
  loadPantry();
}

async function addToVendorList(itemId, itemName, defaultQty) {
  await supabase.from('vendor_order_list').insert([{
    item_id: itemId,
    item_name: itemName,
    order_qty: defaultQty
  }]);
  alert(`Added ${itemName} to next month's vendor list!`);
  loadVendorList();
}

async function loadVendorList() {
  const { data, error } = await supabase.from('vendor_order_list').select('*').eq('status', 'pending');
  if (error) return console.error(error);

  const list = document.getElementById('vendorList');
  if (!data.length) {
    list.innerHTML = '<li>No items marked for reorder yet.</li>';
    return;
  }
  list.innerHTML = data.map(o => `
    <li style="margin-bottom: 8px;">
      <strong>${o.item_name}</strong> - Target Order: ${o.order_qty} units
      <button class="btn" style="margin-left: 10px; font-size: 11px;" onclick="removeFromVendorList('${o.id}')">Remove</button>
    </li>
  `).join('');
}

async function removeFromVendorList(id) {
  await supabase.from('vendor_order_list').delete().eq('id', id);
  loadVendorList();
}

async function exportVendorList() {
  const { data } = await supabase.from('vendor_order_list').select('*').eq('status', 'pending');
  if (!data || !data.length) return alert('Vendor list is empty.');
  
  const text = "NEXT MONTH PANTRY ORDER:\n" + data.map(d => `- ${d.item_name}: ${d.order_qty}`).join('\n');
  navigator.clipboard.writeText(text);
  alert('Order summary copied to clipboard!');
}

loadPantry();
