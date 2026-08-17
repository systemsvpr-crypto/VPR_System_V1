-- purchaseService.js (createDelivery, updateAawakLift) and the Delivery / Aawak
-- Details UIs have always read and written purchase_deliveries.driver_phone_number,
-- but the column was never actually created on this table (only transporters.driver_phone_number
-- exists) — causing "Could not find the 'driver_phone_number' column of 'purchase_deliveries'
-- in the schema cache" whenever a delivery is submitted with a transporter selected.
ALTER TABLE public.purchase_deliveries ADD COLUMN IF NOT EXISTS driver_phone_number text;
