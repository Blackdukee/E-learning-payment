const swagger_schemas = {
    PaymentRequest: {
        type: "object",
        required: ["courseId", "amount", "currency", "source", "educatorId"],
        properties: {
            courseId: { type: "string" },
            amount: { type: "number", minimum: 0.01 , default: 100.01},
            currency: { type: "string", enum: ["USD", "EUR", "GBP"] },
            source: { type: "string" ,default: "pm_card_visa"},
            educatorId: { type: "string", default:"edu_123" },
            description: { type: "string",  default: "enrolling in this course" },
        },
    }, 
    RefundRequest: {
        type: "object",
        required: ["transactionId"],
        properties: {
            transactionId: { type: "string" },
            reason: { type: "string" },
        },
    },
    InvoiceInput: {
        type: "object",
        required: ["transactionId", "subtotal", "status", "billingInfo"],
        properties: {
            transactionId: { type: "string" },
            subtotal: { type: "number", minimum: 0 },
            discount: { type: "number", minimum: 0, default: 0 },
            tax: { type: "number", minimum: 0, default: 0 },
            status: { type: "string" },
            billingInfo: { type: "object" },
            notes: { type: "string" },
        },
    },
    InvoiceUpdate : {
        type: "object",
        required: ["status"],
        properties: {
            status: { type: "string" },
            notes: { type: "string" },
        },
    },
    Invoice: {
        type: "object",
        properties: {
            id: { type: "string" },
            invoiceNumber: { type: "string" },
            transactionId: { type: "string" },
            subtotal: { type: "number" },
            discount: { type: "number" },
            tax: { type: "number" },
            total: { type: "number" },
            status: { type: "string" },
            paidAt: { type: "string", format: "date-time" },
            billingInfo: { type: "object" },
            notes: { type: "string" },
            dueDate: { type: "string", format: "date-time" },
        },
    },
    ErrorResponse: {
        type: "object",
        properties: {
            error: { type: "string" },
            message: { type: "string" },
            statusCode: { type: "integer" },
        },
    },
};

module.exports = {swagger_schemas};