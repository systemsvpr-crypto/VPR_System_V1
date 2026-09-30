import { supabase } from '../supabase';

const sendWhatsappTemplate = async ({ phone, template, language, parameters }) => {
  if (!phone) return;
  const { data, error } = await supabase.functions.invoke('send-whatsapp', {
    body: { phone, template, language, parameters },
  });
  if (error) throw error;
  if (data && data.success === false) {
    console.error("Meta API Error:", data.error);
    throw new Error(`Meta API Error: ${data.metaStatus} - ${JSON.stringify(data.error)}`);
  }
};

export const sendOrderConfirmationWhatsapp = async ({ phone, customerName, itemDetails, totalQty }) => {
  await sendWhatsappTemplate({
    phone,
    template: 'order_confirmation',
    language: 'en',
    parameters: [customerName || 'Customer', itemDetails || '-', String(totalQty ?? '')],
  });
};

const sanitizeParam = (str, allowLineBreaks = false) => {
  if (!str) return '-';
  let s = String(str);
  if (allowLineBreaks) {
    // Replace standard newlines with Unicode line separator (\u2028) so Meta WhatsApp Cloud API
    // accepts multi-line formatting without rejecting with code 132018
    s = s.replace(/\r\n/g, '\u2028').replace(/[\r\n]/g, '\u2028');
  } else {
    s = s.replace(/[\r\n]/g, ' ');
  }
  return s
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ') // Collapse multiple ASCII spaces (Meta rejects 4+ consecutive spaces)
    .trim() || '-';
};

export const sendPurchaseDeliveredWhatsapp = async ({ transporterName, lrNumber, date, productDetails, totalValuesStr, products }) => {
  console.log('Sending WhatsApp via sendPurchaseDeliveredWhatsapp:', { transporterName, lrNumber, date, productDetails, totalValuesStr, products });
  const details = productDetails || (Array.isArray(products) ? products.join('\n\n') : '-');
  const totals = totalValuesStr || '-';

  await sendWhatsappTemplate({
    phone: 'USE_ADMIN_SECRET', // Edge function will intercept this and use the Supabase secret
    template: 'purchase_delivered_2',
    language: 'en',
    parameters: [
      sanitizeParam(transporterName),
      sanitizeParam(lrNumber),
      sanitizeParam(date),
      sanitizeParam(details, true),
      sanitizeParam(totals),
    ],
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

export const PREDEFINED_INDENT_PHONE_NUMBER = '918982185175';


