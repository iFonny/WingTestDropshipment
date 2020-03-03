const _ = require('lodash');
const fs = require('fs');
const axios = require('axios');

// Get datas
const { items } = require('./items');
const { orders } = require('./orders');

function findItemByID(itemId) {
  return _.find(items, { id: itemId });
}

function getPrice(weight) {
  if (weight <= 1) return 1;
  else if (weight <= 5) return 2;
  else if (weight <= 10) return 3;
  else if (weight <= 20) return 5;
  else return 10;
}

function fillParcel(orderId, orderItems) {
  let parcelWeight = 0;
  let itemsInParcel = [];
  const itemsNotInParcel = [];

  for (let orderItem of orderItems) {
    parcelWeight += orderItem.weight;

    if (parcelWeight > 30) {
      parcelWeight -= orderItem.weight;
      itemsNotInParcel.push(orderItem);
    } else itemsInParcel.push(orderItem);
  }

  // Group items by id && set quantity
  const parcelItems = [];
  itemsInParcel = _.groupBy(itemsInParcel, 'item_id');
  for (const key of Object.keys(itemsInParcel)) {
    const items = itemsInParcel[key];
    parcelItems.push({ item_id: key, quantity: items.length });
  }

  return {
    itemsNotInParcel,
    parcel: {
      order_id: orderId,
      items: parcelItems,
      weight: parcelWeight,
      tracking_id: undefined,
      palette_number: undefined
    }
  };
}

// Separates each items
function getSplitedOrderItems(orderItems) {
  let newItems = [];

  for (const orderItem of orderItems) {
    const newItem = {
      item_id: orderItem.item_id,
      weight: parseFloat(findItemByID(orderItem.item_id).weight)
    };
    newItems = _.concat(newItems, _.times(orderItem.quantity, _.constant(newItem)));
  }

  return _.orderBy(newItems, ['weight'], ['desc']);
}

async function generateTrackingAndPaletteNumber(parcels) {
  let paletteNumber = 1;
  let paletteCounter = 0;
  let price = 0;

  for (const [i, parcel] of parcels.entries()) {
    try {
      console.log(`Generating tracking id for parcel (${i + 1}/${parcels.length})...`);
      const { data } = await axios.post('https://helloacm.com/api/random/?n=15');
      parcel.tracking_id = data;
      parcel.palette_number = paletteNumber;

      price += getPrice(parcel.weight);

      paletteCounter += 1;
      if (paletteCounter >= 15) {
        paletteNumber += 1;
        paletteCounter = 0;
      }
    } catch (error) {
      console.error(`Request failed: Can't generate tracking`);
      console.error(error);
    }
  }

  return price;
}

async function generateParcels(orders) {
  const parcels = [];

  for (const order of orders) {
    const splitedItems = getSplitedOrderItems(order.items);

    let { parcel, itemsNotInParcel } = fillParcel(order.id, splitedItems);
    parcels.push(parcel);
    while (itemsNotInParcel.length > 0) {
      ({ parcel, itemsNotInParcel } = fillParcel(order.id, itemsNotInParcel));
      parcels.push(parcel);
    }
  }

  console.log('Number of orders: ', orders.length);
  console.log('Number of parcels generated: ', parcels.length);

  const price = await generateTrackingAndPaletteNumber(parcels);

  console.log('Number of orders: ', orders.length);
  console.log('Number of parcels generated: ', parcels.length);
  console.log('Number of palettes: ', parcels[parcels.length - 1].palette_number);
  console.log(`Rémunération de l’opération: ${price}e`);

  fs.writeFile('parcels.json', JSON.stringify(parcels, null, 2), err => {
    if (err) throw err;
    console.log(`Generated parcels saved to: 'parcels.json'`);
  });
}

generateParcels(orders);
