import dotenv from 'dotenv';
dotenv.config();

export const vnpConfig = {
  vnp_TmnCode: process.env.vnp_TmnCode || '',
  vnp_HashSecret: process.env.vnp_HashSecret || '',
  vnp_Url: process.env.vnp_Url || 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
  vnp_Api: process.env.vnp_Api || 'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
  vnp_ReturnUrl: process.env.vnp_ReturnUrl || 'http://localhost:8888/order/vnpay_return',
};
