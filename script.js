import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, getDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyAI49oaHHpHtJts31sraoZBq08u9yAtkG0",
  authDomain: "self-checkout-cart-system.firebaseapp.com",
  projectId: "self-checkout-cart-system",
  storageBucket: "self-checkout-cart-system.firebasestorage.app",
  messagingSenderId: "231081186084",
  appId: "1:231081186084:web:41a2b668399ae2d062d9b1",
  measurementId: "G-LW064FNZV4"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// --- DOM Element References ---
const dashboardScreen = document.getElementById('dashboard-screen');
const billDisplayScreen = document.getElementById('bill-display-screen');
const backButton = document.getElementById('back-to-dashboard-btn');
const paymentCompleteBtn = document.getElementById('payment-complete-btn');
const activeCartsCountEl = document.getElementById('active-carts-count');
const cartGridContainer = document.getElementById('cart-grid-container');
const billItemsTbody = document.getElementById('bill-items');
const grandTotalSpan = document.getElementById('grand-total-amount');
const billHeaderTitle = document.getElementById('bill-header-title');
// The qrcode-container in your HTML doesn't have an ID, but let's assume it should.
// If it's inside the bill footer, let's find it.
const qrcodeContainer = document.querySelector('.payment-section'); 
const successOverlay = document.getElementById('success-overlay');
const confirmationModal = document.getElementById('confirmation-modal');
const modalText = document.getElementById('modal-text');
const modalCancelBtn = document.getElementById('modal-cancel-btn');
const modalConfirmBtn = document.getElementById('modal-confirm-btn');

// --- Global State ---
let masterCartList = []; // Holds all possible cart IDs: ['cartA', 'cartB', ...]
let activeBillListener = null; // Unsubscribe function for the current bill screen listener
let cartStatusListeners = {}; // Object to hold all dashboard listeners
let currentCartId = null;

// --- Screen & Modal Logic (Unchanged) ---
function showBillScreen(cartId) {
    currentCartId = cartId;
    billHeaderTitle.textContent = formatCartName(cartId);
    listenForBillUpdates(cartId);
    dashboardScreen.classList.remove('active');
    billDisplayScreen.classList.add('active');
}

function showDashboardScreen() {
    if (activeBillListener) {
        activeBillListener(); // Unsubscribe from bill updates
        activeBillListener = null;
    }
    currentCartId = null;
    billDisplayScreen.classList.remove('active');
    dashboardScreen.classList.add('active');
}

function showConfirmationModal(text, onConfirm) {
    modalText.textContent = text;
    confirmationModal.classList.add('visible');
    // Clone and replace the button to remove old event listeners
    const newConfirmBtn = modalConfirmBtn.cloneNode(true);
    modalConfirmBtn.parentNode.replaceChild(newConfirmBtn, modalConfirmBtn);
    newConfirmBtn.addEventListener('click', () => {
        confirmationModal.classList.remove('visible');
        onConfirm();
    }, { once: true }); // Use { once: true } for safety
}

// --- Event Listeners (Unchanged) ---
backButton.addEventListener('click', showDashboardScreen);
paymentCompleteBtn.addEventListener('click', () => {
    const text = `Finalize transaction for ${formatCartName(currentCartId)}? This will clear the cart and print the bill.`;
    showConfirmationModal(text, handlePaymentComplete);
});
modalCancelBtn.addEventListener('click', () => {
    confirmationModal.classList.remove('visible');
});

// --- NEW: Main Application Logic ---
async function initializeDashboard() {
    try {
        const allCartsRef = collection(db, "all_carts");
        const snapshot = await getDocs(allCartsRef);
        masterCartList = snapshot.docs.map(doc => doc.id).sort();

        if (masterCartList.length === 0) {
            cartGridContainer.innerHTML = `<div class="empty-state"><p>No carts registered in 'all_carts' collection.</p></div>`;
            return;
        }

        // Initially render all carts as inactive
        renderCartButtons(masterCartList.map(id => ({ id, isActive: false })));

        // Start listening to each cart collection to see if it becomes active (non-empty)
        monitorAllCarts();

    } catch (error) {
        console.error("Could not fetch the master cart list:", error);
        cartGridContainer.innerHTML = `<div class="empty-state"><p>Error: Could not load cart registry.</p></div>`;
    }
}

// --- NEW: Function to monitor all potential carts ---
function monitorAllCarts() {
    const activeCartIds = new Set();

    masterCartList.forEach(cartId => {
        const cartCollectionRef = collection(db, cartId);

        // Set up a real-time listener for each cart's collection
        const unsubscribe = onSnapshot(cartCollectionRef, (snapshot) => {
            if (snapshot.empty) {
                // If the cart collection is empty, it's inactive
                activeCartIds.delete(cartId);
            } else {
                // If the cart collection has items, it's active
                activeCartIds.add(cartId);
            }
            
            // Update the entire dashboard UI based on the new set of active carts
            updateDashboardUI(activeCartIds);
        });

        // Store the unsubscribe function in case we need to detach listeners later
        cartStatusListeners[cartId] = unsubscribe;
    });
}

// --- NEW: Function to update the dashboard UI ---
function updateDashboardUI(activeCartIds) {
    activeCartsCountEl.textContent = activeCartIds.size;

    const cartStatusList = masterCartList.map(cartId => ({
        id: cartId,
        isActive: activeCartIds.has(cartId)
    }));

    // Sort active carts to the top, then alphabetically
    cartStatusList.sort((a, b) => {
        if (a.isActive !== b.isActive) {
            return a.isActive ? -1 : 1;
        }
        return a.id.localeCompare(b.id);
    });

    renderCartButtons(cartStatusList);
}


function renderCartButtons(sortedCarts) {
    // A check to prevent re-rendering if the active/inactive state hasn't changed,
    // which can be useful but is optional. For simplicity, we re-render.
    cartGridContainer.innerHTML = '';
    
    if (sortedCarts.length === 0) {
        // This case is handled in initializeDashboard, but good to have a fallback
        cartGridContainer.innerHTML = `<div class="empty-state"><p>No carts to display.</p></div>`;
        return;
    }

    sortedCarts.forEach(cart => {
        const button = document.createElement('div');
        button.className = `cart-button ${cart.isActive ? 'active' : 'inactive'}`;
        button.textContent = formatCartName(cart.id);
        button.dataset.cartId = cart.id; // Store cart ID for the event listener

        if (cart.isActive) {
            button.addEventListener('click', () => showBillScreen(cart.id));
        }

        cartGridContainer.appendChild(button);
    });
}

function formatCartName(cartId) {
    if (!cartId) return '';
    const nameParts = cartId.match(/([a-zA-Z]+)(.*)/);
    if (!nameParts) return cartId;
    let [, part1, part2] = nameParts;
    part1 = part1.charAt(0).toUpperCase() + part1.slice(1).toLowerCase();
    return `${part1} ${part2}`;
}

// --- UPDATED: Bill-specific Functions ---
function listenForBillUpdates(cartId) {
    // Unsubscribe from any previously active bill listener
    if (activeBillListener) activeBillListener();

    const billCollectionRef = collection(db, cartId);
    
    // Listen for changes to the documents (items) inside the cart's collection
    activeBillListener = onSnapshot(billCollectionRef, async (snapshot) => {
        if (snapshot.empty) {
            renderBill([]); // Render an empty bill if the cart is cleared
            return;
        }

        // Map each document (item) to a promise that fetches its details from 'stock'
        const itemDetailPromises = snapshot.docs.map(itemDoc => {
            const barcode = itemDoc.id;
            const itemData = itemDoc.data();
            const stockDocRef = doc(db, "stock", barcode);
            
            return getDoc(stockDocRef).then(stockDoc => {
                if (stockDoc.exists()) {
                    // Combine stock details with cart quantity
                    return { ...stockDoc.data(), quantity: itemData.quantity || 0, id: barcode };
                }
                // Handle case where item in cart is not in stock (or was deleted)
                return { name: `Unknown Item (${barcode})`, price: 0, quantity: itemData.quantity || 0, id: barcode };
            });
        });

        const resolvedItems = await Promise.all(itemDetailPromises);
        renderBill(resolvedItems.filter(item => item !== null));
    });
}

//UPDATED FUNCTION
function renderBill(items) {
    billItemsTbody.innerHTML = '';
    let grandTotal = 0;

    if (items.length === 0) {
        billItemsTbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">This cart is empty.</td></tr>';
    } else {
        items.forEach(item => {
            const itemTotal = item.price * item.quantity;
            grandTotal += itemTotal;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.name}</td>
                <td>₹${item.price.toFixed(2)}</td>
                <td>${item.quantity}</td>
                <td>₹${itemTotal.toFixed(2)}</td>
            `;
            billItemsTbody.appendChild(row);
        });
    }

    grandTotalSpan.textContent = `₹${grandTotal.toFixed(2)}`;
    
    // The QR code generation logic has been completely removed.
}

// --- UPDATED: Payment and Deletion Logic ---
async function handlePaymentComplete() {
    if (!currentCartId) return;
    
    handlePrintBill(); // Print first
    
    try {
        // This helper function will delete all items in the cart's collection
        await clearCartCollection(currentCartId);
        
        console.log(`All items in collection ${currentCartId} have been deleted.`);
        
        successOverlay.classList.add('visible');
        setTimeout(() => {
            successOverlay.classList.remove('visible');
            showDashboardScreen();
        }, 2000);

    } catch (error) {
        console.error("Error clearing cart collection:", error);
        alert("An error occurred while clearing the cart. Please check the console.");
    }
}

// --- NEW: Helper function to delete all documents in a collection ---
async function clearCartCollection(cartId) {
    const cartCollectionRef = collection(db, cartId);
    const snapshot = await getDocs(cartCollectionRef);

    if (snapshot.empty) return; // Nothing to delete

    // Create an array of delete promises
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));

    // Wait for all delete operations to complete
    await Promise.all(deletePromises);
}


// --- Printing Logic (Unchanged) ---
function handlePrintBill() {
    const printableBillHTML = generatePrintableBill();
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument.write(printableBillHTML);
    iframe.contentDocument.close();
    iframe.contentWindow.print();
    setTimeout(() => document.body.removeChild(iframe), 1000); // Clean up iframe
}

function generatePrintableBill() {
    const billItemsHTML = billItemsTbody.innerHTML;
    const grandTotal = grandTotalSpan.innerHTML;
    const cartTitle = billHeaderTitle.innerHTML;
    const logoUrl = "./images/BillBee1-removebg-preview.png"; // Make sure this path is correct
    // Refined print style to be more receipt-like
    return `
        <html><head><title>BillBee Receipt</title><style>
        body { font-family: 'Courier New', Courier, monospace; width: 300px; margin: 0 auto; color: #000; }
        .header { text-align: center; } .header img { max-width: 150px; margin-bottom: 10px; }
        h2, p { text-align: center; margin: 5px 0; }
        table { width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 14px; }
        th, td { padding: 5px; text-align: left; }
        thead tr { border-bottom: 1px dashed #000; }
        tbody td:nth-child(2), tbody td:nth-child(3) { text-align: center; }
        tbody td:last-child { text-align: right; }
        hr { border: none; border-top: 1px dashed #000; }
        .total-line { display: flex; justify-content: space-between; font-weight: bold; font-size: 1.1em; padding: 5px 0; }
        .footer-text { text-align: center; margin-top: 10px; font-size: 12px; }
        </style></head><body>
        <div class="header"><img src="${logoUrl}" alt="BillBee Logo"></div>
        <h2>Receipt</h2><p>${cartTitle}</p><p>${new Date().toLocaleString()}</p><hr>
        <table>
            <thead><tr><th>Item</th><th>Price</th><th>Qty</th><th style="text-align:right;">Total</th></tr></thead>
            <tbody>${billItemsHTML}</tbody>
        </table>
        <hr>
        <div class="total-line"><span>Grand Total:</span><span>${grandTotal}</span></div>
        <hr>
        <p class="footer-text">Thank you for shopping with us!</p>
        </body></html>
    `;
}

// --- Initializer ---
initializeDashboard();