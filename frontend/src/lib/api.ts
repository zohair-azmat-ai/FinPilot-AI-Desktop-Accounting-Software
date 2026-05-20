import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

export function getCloudPdfUrl(): string | null {
  if (typeof window === "undefined") return null;
  const u = localStorage.getItem("fp_cloud_pdf_url");
  return u ? u.replace(/\/$/, "") : null;
}
export function setCloudPdfUrl(url: string) {
  if (typeof window === "undefined") return;
  if (url.trim()) {
    localStorage.setItem("fp_cloud_pdf_url", url.trim().replace(/\/$/, ""));
  } else {
    localStorage.removeItem("fp_cloud_pdf_url");
  }
}

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

type ApiErrorShape = { response?: { data?: { detail?: string | { msg: string }[] } } };
export function apiErr(e: unknown, fallback = "Failed"): string {
  const err = e as ApiErrorShape;
  const detail = err?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join("; ");
  return fallback;
}

// Company
export const getCompany = () => api.get("/api/company/");
export const saveCompany = (data: unknown) => api.post("/api/company/", data);
export const uploadStamp = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/api/company/stamp", fd, { headers: { "Content-Type": undefined } });
};

// Customers
export const getCustomers = () => api.get("/api/customers/");
export const getCustomer = (id: number) => api.get(`/api/customers/${id}`);
export const createCustomer = (data: unknown) => api.post("/api/customers/", data);
export const updateCustomer = (id: number, data: unknown) => api.put(`/api/customers/${id}`, data);
export const deleteCustomer = (id: number) => api.delete(`/api/customers/${id}`);

// Suppliers
export const getSuppliers = () => api.get("/api/suppliers/");
export const createSupplier = (data: unknown) => api.post("/api/suppliers/", data);
export const updateSupplier = (id: number, data: unknown) => api.put(`/api/suppliers/${id}`, data);
export const deleteSupplier = (id: number) => api.delete(`/api/suppliers/${id}`);

// Items
export const getItems = () => api.get("/api/items/");
export const createItem = (data: unknown) => api.post("/api/items/", data);
export const updateItem = (id: number, data: unknown) => api.put(`/api/items/${id}`, data);
export const deleteItem = (id: number) => api.delete(`/api/items/${id}`);

// Quotations
export const getQuotations = () => api.get("/api/quotations/");
export const getQuotation = (id: number) => api.get(`/api/quotations/${id}`);
export const createQuotation = (data: unknown) => api.post("/api/quotations/", data);
export const updateQuotation = (id: number, data: unknown) => api.put(`/api/quotations/${id}`, data);
export const convertQuotation = (id: number) => api.post(`/api/quotations/${id}/convert`);
export const deleteQuotation = (id: number) => api.delete(`/api/quotations/${id}`);
export const downloadQuotationPDF = (id: number, num?: string) => {
  const ts = Date.now();
  const cloud = getCloudPdfUrl();
  if (cloud && num) return `${cloud}/api/quotations/${encodeURIComponent(num)}/pdf?ts=${ts}`;
  return `${API_URL}/api/quotations/${id}/pdf?ts=${ts}`;
};

// Invoices
export const getInvoices = (params?: Record<string, unknown>) => api.get("/api/invoices/", { params });
export const getInvoice = (id: number) => api.get(`/api/invoices/${id}`);
export const createInvoice = (data: unknown) => api.post("/api/invoices/", data);
export const updateInvoice = (id: number, data: unknown) => api.put(`/api/invoices/${id}`, data);
export const deleteInvoice = (id: number) => api.delete(`/api/invoices/${id}`);
export const downloadInvoicePDF = (id: number, num?: string) => {
  const ts = Date.now();
  const cloud = getCloudPdfUrl();
  if (cloud && num) return `${cloud}/api/invoices/${encodeURIComponent(num)}/pdf?ts=${ts}`;
  return `${API_URL}/api/invoices/${id}/pdf?ts=${ts}`;
};

// Payments
export const getPayments = (params?: Record<string, unknown>) => api.get("/api/payments/", { params });
export const createPayment = (data: unknown) => api.post("/api/payments/", data);
export const deletePayment = (id: number) => api.delete(`/api/payments/${id}`);
export const downloadPaymentPDF = (id: number) => `${API_URL}/api/payments/${id}/pdf?ts=${Date.now()}`;
export const downloadReceiptPDF = (id: number) => `${API_URL}/api/payments/${id}/pdf?ts=${Date.now()}`;

// Ledger
export const getCustomerLedger = (customerId: number, params?: Record<string, unknown>) =>
  api.get(`/api/ledger/customer/${customerId}`, { params });
export const getStatement = (customerId: number, params?: Record<string, unknown>) =>
  api.get(`/api/ledger/statement/${customerId}`, { params });
export const downloadStatementPDF = (customerId: number, params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return `${API_URL}/api/ledger/statement/${customerId}/pdf${qs}`;
};

// Reports
export const getDashboard = () => api.get("/api/reports/dashboard");
export const getSalesReport = (params?: Record<string, unknown>) => api.get("/api/reports/sales", { params });
export const getOutstandingReport = () => api.get("/api/reports/outstanding");
export const getVATReport = (params?: Record<string, unknown>) => api.get("/api/reports/vat", { params });
export const getCustomerBalanceReport = () => api.get("/api/reports/customer-balance");

// AI
export const processAICommand = (command: string) => api.post("/api/ai/command", { command });

// Backup
export const backupDatabase = () => api.get("/api/backup");

// Bank Accounts
export const getBankAccounts = () => api.get("/api/bank-accounts/");
export const getBankAccountsSummary = () => api.get("/api/bank-accounts/summary");
export const getBankAccount = (id: number) => api.get(`/api/bank-accounts/${id}`);
export const getBankBalance = (id: number) => api.get(`/api/bank-accounts/${id}/balance`);
export const createBankAccount = (data: unknown) => api.post("/api/bank-accounts/", data);
export const updateBankAccount = (id: number, data: unknown) => api.put(`/api/bank-accounts/${id}`, data);
export const deleteBankAccount = (id: number) => api.delete(`/api/bank-accounts/${id}`);

// Bank Transactions
export const getBankTransactions = (params?: Record<string, unknown>) =>
  api.get("/api/bank-transactions/", { params });
export const createBankTransaction = (data: unknown) => api.post("/api/bank-transactions/", data);
export const deleteBankTransaction = (id: number) => api.delete(`/api/bank-transactions/${id}`);
export const getBankStatement = (accountId: number, params?: Record<string, string>) =>
  api.get(`/api/bank-transactions/statement/${accountId}`, { params });
export const downloadBankStatementPDF = (accountId: number, params?: Record<string, string>) => {
  const qs = params ? "?" + new URLSearchParams(params).toString() : "";
  return `${API_URL}/api/bank-transactions/statement/${accountId}/pdf${qs}`;
};

// Cheques
export const getCheques = (params?: Record<string, unknown>) => api.get("/api/cheques/", { params });
export const createCheque = (data: unknown) => api.post("/api/cheques/", data);
export const updateChequeStatus = (id: number, status: string) =>
  api.patch(`/api/cheques/${id}/status`, { status });
export const deleteCheque = (id: number) => api.delete(`/api/cheques/${id}`);
export const getChequeStats = () => api.get("/api/cheques/summary/stats");

// Delivery Notes
export const getDeliveryNotes = (params?: Record<string, unknown>) => api.get("/api/delivery-notes/", { params });
export const getDeliveryNote = (id: number) => api.get(`/api/delivery-notes/${id}`);
export const createDeliveryNote = (data: unknown) => api.post("/api/delivery-notes/", data);
export const updateDeliveryNote = (id: number, data: unknown) => api.put(`/api/delivery-notes/${id}`, data);
export const deleteDeliveryNote = (id: number) => api.delete(`/api/delivery-notes/${id}`);
export const downloadDeliveryNotePDF = (id: number, num?: string) => {
  const ts = Date.now();
  const cloud = getCloudPdfUrl();
  if (cloud && num) return `${cloud}/api/delivery-notes/${encodeURIComponent(num)}/pdf?ts=${ts}`;
  return `${API_URL}/api/delivery-notes/${id}/pdf?ts=${ts}`;
};

// Expenses
export const getExpenses = (params?: Record<string, unknown>) => api.get("/api/expenses/", { params });
export const getExpenseSummary = (params?: Record<string, unknown>) =>
  api.get("/api/expenses/summary", { params });
export const getExpenseCategories = () => api.get("/api/expenses/categories");
export const getExpenseParties = () => api.get("/api/expenses/parties");
export const createExpense = (data: unknown) => api.post("/api/expenses/", data);
export const updateExpense = (id: number, data: unknown) => api.put(`/api/expenses/${id}`, data);
export const deleteExpense = (id: number) => api.delete(`/api/expenses/${id}`);

// Purchase Orders
export const getPurchaseOrders = (params?: Record<string, unknown>) => api.get("/api/purchase-orders/", { params });
export const getPurchaseOrder = (id: number) => api.get(`/api/purchase-orders/${id}`);
export const createPurchaseOrder = (data: unknown) => api.post("/api/purchase-orders/", data);
export const updatePurchaseOrder = (id: number, data: unknown) => api.put(`/api/purchase-orders/${id}`, data);
export const deletePurchaseOrder = (id: number) => api.delete(`/api/purchase-orders/${id}`);
export const downloadPurchaseOrderPDF = (id: number, num?: string) => {
  const ts = Date.now();
  const cloud = getCloudPdfUrl();
  if (cloud && num) return `${cloud}/api/purchase-orders/${encodeURIComponent(num)}/pdf?ts=${ts}`;
  return `${API_URL}/api/purchase-orders/${id}/pdf?ts=${ts}`;
};

// Backup & Restore
export const downloadBackup = () => `${API_URL}/api/backup`;
export const restoreBackup = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post("/api/restore", form, { headers: { "Content-Type": "multipart/form-data" } });
};

// License
export const getLicenseStatus = () => api.get("/api/license/status");
export const getLicenseHwid = () => api.get("/api/license/hwid");
export const activateLicense = (key: string) => api.post("/api/license/activate", { key });

// Supplier Bills
export const getSupplierBills = (params?: Record<string, unknown>) => api.get("/api/supplier-bills/", { params });
export const getSupplierBill = (id: number) => api.get(`/api/supplier-bills/${id}`);
export const createSupplierBill = (data: unknown) => api.post("/api/supplier-bills/", data);
export const updateSupplierBill = (id: number, data: unknown) => api.put(`/api/supplier-bills/${id}`, data);
export const deleteSupplierBill = (id: number) => api.delete(`/api/supplier-bills/${id}`);
export const downloadSupplierBillPDF = (id: number) => `${API_URL}/api/supplier-bills/${id}/pdf?ts=${Date.now()}`;
export const getSupplierLedger = (supplierId: number) => api.get(`/api/supplier-bills/ledger/${supplierId}`);

// Cloud Sync
export const getCloudStatus = () => api.get("/api/cloud/status");
export const cloudConnect = (data: { url: string; anon_key: string; workspace_id: string }) =>
  api.post("/api/cloud/connect", data);
export const cloudDisconnect = () => api.post("/api/cloud/disconnect");
export const cloudSyncNow = () => api.post("/api/cloud/sync/now");
export const cloudRestore = () => api.post("/api/cloud/restore");
export const getCloudSchema = () => api.get("/api/cloud/schema");

// Supplier Payments
export const getSupplierPayments = (params?: Record<string, unknown>) => api.get("/api/supplier-payments/", { params });
export const createSupplierPayment = (data: unknown) => api.post("/api/supplier-payments/", data);
export const updateSupplierPayment = (id: number, data: unknown) => api.put(`/api/supplier-payments/${id}`, data);
export const deleteSupplierPayment = (id: number) => api.delete(`/api/supplier-payments/${id}`);
export const downloadSupplierPaymentPDF = (id: number) => `${API_URL}/api/supplier-payments/${id}/pdf?ts=${Date.now()}`;
