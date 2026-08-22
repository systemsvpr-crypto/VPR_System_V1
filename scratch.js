const fs = require('fs');
const file = 'src/services/purchaseService.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
`      *,
      godowns:godown_id(name),
      vendors:vendor_id(name),
      purchase_indent_items(*, products:product_id(name, unit))`,
`      *,
      purchase_indent_items(*, products:product_id(name, unit))`
);

content = content.replace(
`.insert([{ indent_date, indent_number, godown_id: godown_id || null, vendor_id: vendor_id || null, remarks, total_amount: total, created_by, process_type: process_type || 'process' }])`,
`.insert([{ indent_date, indent_number, total_amount: total, created_by, process_type: process_type || 'process' }])`
);

content = content.replace(
`      indent_qty: Number(item.quantity),
      rate: Number(item.rate),
      ...(isDirect ? { vendor_id, approval_status: 'Approved', planning_status: 'Planned', approved_by: created_by || null } : {}),`,
`      indent_qty: Number(item.quantity),
      rate: Number(item.rate),
      approved_godown_id: godown_id || null,
      vendor_id: vendor_id || null,
      vendor_remarks: remarks || null,
      ...(isDirect ? { approval_status: 'Approved', planning_status: 'Planned', approved_by: created_by || null } : {}),`
);

content = content.replace(
`const updateFields = { indent_date, indent_number, godown_id: godown_id || null, vendor_id: vendor_id || null, remarks, total_amount: total };`,
`const updateFields = { indent_date, indent_number, total_amount: total };`
);

content = content.replace(
`          indent_qty: Number(item.quantity),
          rate: Number(item.rate),
          ...(isDirect ? { vendor_id, approval_status: 'Approved', planning_status: 'Planned', approved_by: user_id || null } : {}),`,
`          indent_qty: Number(item.quantity),
          rate: Number(item.rate),
          approved_godown_id: godown_id || null,
          vendor_id: vendor_id || null,
          vendor_remarks: remarks || null,
          ...(isDirect ? { approval_status: 'Approved', planning_status: 'Planned', approved_by: user_id || null } : {}),`
);

content = content.replace(
`      purchase_indents!inner(
        indent_id, indent_date, indent_number, godown_id, vendor_id, remarks, process_type,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )`,
`      purchase_indents!inner(
        indent_id, indent_date, indent_number, process_type
      )`
);

content = content.replace(
`      purchase_indents!inner(
        indent_id, indent_date, indent_number, godown_id, vendor_id, remarks, process_type,
        godowns:godown_id(name),
        vendors:vendor_id(name)
      )`,
`      purchase_indents!inner(
        indent_id, indent_date, indent_number, process_type
      )`
);

content = content.replace(
`    const headerUpdate = {};
    if (vendor_id !== undefined) headerUpdate.vendor_id = vendor_id || null;
    if (vendor_remarks !== undefined) headerUpdate.remarks = vendor_remarks || null;`,
`    const headerUpdate = {};`
);

content = content.replace(
`      *,
      godowns:godown_id(name),
      vendors:vendor_id(name),
      purchase_indent_items(`,
`      *,
      purchase_indent_items(`
);

content = content.replace(
/purchase_indents!inner\(\s*indent_id, indent_date, indent_number, godown_id, vendor_id, is_void, process_type,\s*godowns:godown_id\(name\),\s*vendors:vendor_id\(name\)\s*\)/g,
`purchase_indents!inner(
        indent_id, indent_date, indent_number, is_void, process_type
      )`
);

content = content.replace(
`      purchase_indents!inner(
        indent_id, indent_date, indent_number, process_type, vendor_id, is_void,
        vendors:vendor_id(name)
      ),`,
`      purchase_indents!inner(
        indent_id, indent_date, indent_number, process_type, is_void
      ),`
);

content = content.replace(
`      purchase_indents!inner(godown_id, is_void),`,
`      purchase_indents!inner(is_void),`
);

fs.writeFileSync(file, content);
console.log('done');
