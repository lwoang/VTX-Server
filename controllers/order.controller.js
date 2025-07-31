import { vnpConfig } from "../config/vnpay.config.js";
import CartProductModel from "../models/cartproduct.model.js";
import OrderModel from "../models/order.model.js";
import UserModel from "../models/user.model.js";
import ProductModel from "../models/product.model.js"; 
import mongoose from "mongoose";
import qs from "qs";
import crypto from "crypto";
import moment from "moment"; 

export async function CashOnDeliveryOrderController(request, response) {
    try {
        const userId = request.userId // auth middleware 
        const { list_items, totalAmt, addressId, subTotalAmt } = request.body 

        const payload = list_items.map(el => {
            return ({
                userId: userId,
                orderId: `ORD-${new mongoose.Types.ObjectId()}`,
                productId: el.productId._id, 
                product_details: {
                    name: el.productId.name,
                    image: el.productId.image
                } ,
                paymentId: "",
                payment_status: "CASH ON DELIVERY",
                delivery_address: addressId ,
                subTotalAmt: subTotalAmt,
                totalAmt: totalAmt,
            })
        })

        const generatedOrder = await OrderModel.insertMany(payload)

        ///remove from the cart
        const removeCartItems = await CartProductModel.deleteMany({ userId: userId })
        const updateInUser = await UserModel.updateOne({ _id: userId }, { shopping_cart: [] })

        return response.json({
            message: "Order successfully",
            error: false,
            success: true,
            data: generatedOrder
        })

    } catch (error) {
        return response.status(500).json({
            message: error.message || error ,
            error: true,
            success: false
        })
    }
}

export const pricewithDiscount = (price, dis = 1) => {
    const discountAmout = Math.ceil((Number(price) * Number(dis)) / 100)
    const actualPrice = Number(price) - Number(discountAmout)
    return actualPrice
}

export async function vnpayPaymentController(request, response) {
    try {
        process.env.TZ = 'Asia/Ho_Chi_Minh';

        const userId = request.userId;
        const { totalAmt, addressId, bankCode, language } = request.body;

        let date = new Date();
        let createDate = moment(date).format('YYYYMMDDHHmmss');
        let orderId = moment(date).format('DDHHmmss');
        let amount = totalAmt * 100;

        let ipAddr = request.headers['x-forwarded-for'] ||
            request.connection.remoteAddress ||
            request.socket?.remoteAddress ||
            request.connection?.socket?.remoteAddress;

        const tmnCode = vnpConfig.vnp_TmnCode;
        console.log("tmnCode", tmnCode);
        const secretKey = vnpConfig.vnp_HashSecret;
        console.log("secretKey", secretKey);
        const vnpUrl = vnpConfig.vnp_Url;
        console.log("vnpUrl", vnpUrl);
        const returnUrl = vnpConfig.vnp_ReturnUrl;
        console.log("returnUrl", returnUrl);

        let locale = language;
        if (!locale) {
            locale = 'vn';
        }
        let currCode = 'VND';

        let vnp_Params = {
            'vnp_Version': '2.1.0',
            'vnp_Command': 'pay',
            'vnp_TmnCode': tmnCode,
            'vnp_Locale': locale,
            'vnp_CurrCode': currCode,
            'vnp_TxnRef': orderId,
            'vnp_OrderInfo': 'Thanh toan cho ma GD:' + orderId,
            'vnp_OrderType': 'other',
            'vnp_Amount': amount,
            'vnp_ReturnUrl': returnUrl,
            'vnp_IpAddr': ipAddr,
            'vnp_CreateDate': createDate,
        };

        if (bankCode) {
            vnp_Params['vnp_BankCode'] = bankCode;
        }

        vnp_Params = sortObject(vnp_Params);

        const signData = qs.stringify(vnp_Params, { encode: false });
        const hmac = crypto.createHmac("sha512", secretKey);
        const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest("hex");
        vnp_Params['vnp_SecureHash'] = signed;

        const paymentUrl = `${vnpUrl}?${qs.stringify(vnp_Params, { encode: false })}`;

        return response.json({
            paymentUrl,
            success: true,
            error: false,
        });
    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        });
    }
}

// Hàm sắp xếp object theo key
function sortObject(obj) {
    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (let key of keys) {
        sorted[key] = obj[key];
    }
    return sorted;
}


const getOrderProductItems = async ({
    lineItems,
    userId,
    addressId,
    paymentId,
    payment_status,
}) => {
    const productList = [];

    if (lineItems?.length) {
        for (const item of lineItems) {
            // Giả sử item.productId là _id của sản phẩm trong DB
            const product = await ProductModel.findById(item.productId);

            const payload = {
                userId: userId,
                orderId: `ORD-${new mongoose.Types.ObjectId()}`,
                productId: product._id,
                product_details: {
                    name: product.name,
                    image: product.image,
                },
                paymentId: paymentId,
                payment_status: payment_status,
                delivery_address: addressId,
                subTotalAmt: Number(item.subTotalAmt),
                totalAmt: Number(item.totalAmt),
            };

            productList.push(payload);
        }
    }

    return productList;
}

//http://localhost:8080/api/order/webhook
export async function webhookVnpay(request, response) {
    try {
        const vnp_Params = request.query; 
        const secretKey = vnpConfig.vnp_HashSecret;

        // Lấy và loại bỏ vnp_SecureHash để xác thực
        const secureHash = vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHash'];
        delete vnp_Params['vnp_SecureHashType'];

        // Sắp xếp tham số và tạo chuỗi hash
        const sortedParams = sortObject(vnp_Params);
        const signData = qs.stringify(sortedParams, { encode: false });
        const hmac = crypto.createHmac("sha512", secretKey);
        const signed = hmac.update(signData).digest("hex");

        if (secureHash === signed) {
            // Xác thực thành công
            const orderId = vnp_Params['vnp_TxnRef'];
            const paymentStatus = vnp_Params['vnp_TransactionStatus'] === '00' ? 'PAID' : 'FAILED';

            // Tìm và cập nhật đơn hàng
            const order = await OrderModel.findOneAndUpdate(
                { orderId: orderId },
                { payment_status: paymentStatus, paymentId: vnp_Params['vnp_TransactionNo'] }
            );

            if (order && paymentStatus === 'PAID') {
                // Xóa giỏ hàng nếu thanh toán thành công
                await UserModel.findByIdAndUpdate(order.userId, { shopping_cart: [] });
                await CartProductModel.deleteMany({ userId: order.userId });
            }

            return response.json({ code: '00', message: 'success' });
        } else {
            // Xác thực thất bại
            return response.status(400).json({ code: '97', message: 'Invalid signature' });
        }
    } catch (error) {
        return response.status(500).json({ code: '99', message: error.message || error });
    }
}


export async function getOrderDetailsController(request, response) {
    try {
        const userId = request.userId // order id

        const orderlist = await OrderModel.find({ userId: userId }).sort({ createdAt: -1 }).populate('delivery_address')

        return response.json({
            message: "order list",
            data: orderlist,
            error: false,
            success: true
        })
    } catch (error) {
        return response.status(500).json({
            message: error.message || error,
            error: true,
            success: false
        })
    }
}
