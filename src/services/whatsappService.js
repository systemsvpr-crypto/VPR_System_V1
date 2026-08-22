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

const sanitizeParam = (str) => {
  if (!str) return '-';
  return String(str)
    .replace(/[\n\t\r]/g, ' ') // Remove newlines and tabs
    .replace(/\s{2,}/g, ' ')   // Reduce multiple spaces to a single space (Meta rejects > 4)
    .trim() || '-';
};

export const sendPurchaseDeliveredWhatsapp = async ({ transporterName, lrNumber, date, productDetails, totalValuesStr }) => {
  console.log('Sending WhatsApp via sendPurchaseDeliveredWhatsapp:', { transporterName, lrNumber, date, productDetails, totalValuesStr });
  await sendWhatsappTemplate({
    phone: 'USE_ADMIN_SECRET', // Edge function will intercept this and use the Supabase secret
    template: 'purchase_delivered_2',
    language: 'en',
    parameters: [
      sanitizeParam(transporterName),
      sanitizeParam(lrNumber),
      sanitizeParam(date),
      sanitizeParam(productDetails),
      sanitizeParam(totalValuesStr)
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

export const PREDEFINED_INDENT_PHONE_NUMBER ='918982185175';


