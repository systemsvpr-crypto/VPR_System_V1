import { supabase } from '../supabase';

const sendWhatsappTemplate = async ({ phone, template, language, parameters }) => {
  if (!phone) return;
  const { error } = await supabase.functions.invoke('send-whatsapp', {
    body: { phone, template, language, parameters },
  });
  if (error) throw error;
};

export const sendOrderConfirmationWhatsapp = async ({ phone, customerName, itemDetails, totalQty }) => {
  await sendWhatsappTemplate({
    phone,
    template: 'order_confirmation',
    language: 'en',
    parameters: [customerName || 'Customer', itemDetails || '-', String(totalQty ?? '')],
  });
};

export const sendPurchaseDeliveredWhatsapp = async ({ phone, transporterName, lrNumber, date, products }) => {
  const padded = [...(products || []), '-', '-', '-'].slice(0, 3);
  await sendWhatsappTemplate({
    phone,
    template: 'purchase_delivered',
    language: 'en',
    parameters: [transporterName || '-', lrNumber || '-', date || '-', ...padded],
  });
};

export const sendDispatchConfirmationWhatsapp = async ({ phone, customerName, orderNumber, productDetails, dispatchDate, totalQty }) => {
  await sendWhatsappTemplate({
    phone,
    template: 'dispatch_confirmation',
    language: 'en_US',
    parameters: [
      customerName || 'Customer',
      orderNumber || '-',
      productDetails || '-',
      dispatchDate || '-',
      String(totalQty ?? ''),
    ],
  });
};

export const PREDEFINED_INDENT_PHONE_NUMBER ='919981175504';


