'use strict';
const plaid = require('plaid');
const dynamo = require('./pages/util/dynamo');
const AWS = require('aws-sdk');
const sns = new AWS.SNS();
const moment = require('moment');

const clientId = process.env.PLAID_CLIENT_ID;
const key = process.env.PLAID_KEY;
const secret = process.env.PLAID_SECRET;

const client = new plaid.Client(clientId, key, secret, plaid.environments.development)

module.exports.handler = async (event, context, callback) => {
    let institutions = await dynamo.getInstitutions();
    let transaction_map = await Promise.all(institutions.Items.map(i => transactions(i.accessToken)));
    let transaction_array = transaction_map.flat();
    let transaction_date = moment().subtract(2, 'day').format("YYYY-MM-DD");
    let transaction_today = transaction_array.filter(t => t.date === transaction_date);
    
    let today_amount = totalAmount(transaction_today)
    let total_amount = totalAmount(transaction_array);
    let category_breakdown = categories(transaction_array);
    let shop_breakdown = shops(transaction_array);

    category_breakdown.delete('Transfer');
    category_breakdown.delete('Bank Fees');
    category_breakdown.delete('Credit');

    shop_breakdown.delete('Online Payment');
    shop_breakdown.delete('Your Cash');
    shop_breakdown.delete('Cr Adj');
    shop_breakdown.delete('Payment Thank');
    shop_breakdown.delete('Apple.com/bill');
    shop_breakdown.delete('Www.herokucharge.c');

    let text = `You have spent $${total_amount.toFixed(2)} so far this month and $${today_amount.toFixed(2)} yesterday.`
    let text2 = `\n\nThat's:`;
    category_breakdown.forEach((value, key) => {
        text2 += `\n$${value.toFixed(2)} on ${key}`;
    });
    text2 += `\n\nYou spent:`
    shop_breakdown.forEach((value, key) => {
        text2 += `\n$${value.toFixed(2)} at ${key}`;
    });

    let sender = 'budget';
    await sendMessage(text, '+1**********', sender);
    await sendMessage(text, '+1**********', sender);

    if(moment().day() === 0) {
        await sendMessage(text2, '+1**********', sender);
        await sendMessage(text2, '+1**********', sender);
    }

    const response = {
        statusCode: 200,
        body: JSON.stringify({text})
    };
    return callback(null, response);
};


async function transactions(accessToken) {
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth()+1);

    const startStr = dateString(start);
    const endStr = dateString(end);

    return await client.getTransactions(accessToken, startStr, endStr, {count: 250, offset: 0}).then(result => {
        return result.transactions.map(t => {
            let t_name = formatName(t.name);
            return {name: t_name, amount: t.amount, category: t.category, date: t.date}
         });
    }).catch(err => {
        console.log(err);
    });
}

function dateString(date) {
    var month = '' + (date.getMonth() + 1);

    if (month.length < 2) {
        month = '0' + month;
    }

    return `${date.getFullYear()}-${month}-01`;
}

function formatName(name) {
    if  (name.length > 18) {
        let name_array = name.split(' ');
        if (name_array.length > 2) {
            name = `${name_array[0]} ${name_array[1]}`
        }
        if (name.length > 18) {
            name = name.substr(0, 18);
        }
    }
    name = name.replace(' and', '');
    return toTitleCase(name);
}

function toTitleCase(str) {
    return str.replace(
        /\w\S*/g,
        function(txt) {
            return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
        }
    );
}

function totalAmount(transactions) {
    let total_amount = 0.0;
    transactions.forEach(t => {
        if(t.amount > 0 ) {total_amount += t.amount}
    });
    return total_amount;
}

function categories(transactions) {
    let category_map = new Map();
    transactions.forEach(t => {
        let category = t.category[0];
        if(t.category.length > 1) {
            category = formatName(t.category[1]);
        }
        let category_amount = (category_map.get(category) || 0) + t.amount;
        category_map.set(category, category_amount);
    });
    return category_map;
}

function shops(transactions) {
    let shop_map = new Map();
    transactions.forEach(t => {
        let shop_amount = (shop_map.get(t.name) || 0) + t.amount;
        shop_map.set(t.name, shop_amount);
    });
    return shop_map;
}

async function sendMessage(text, receiver, sender) {
    await sns.publish({
		Message: text,
		MessageAttributes: {
			'AWS.SNS.SMS.SMSType': {
			DataType: 'String',
			StringValue: 'Promotional'
		},
		'AWS.SNS.SMS.SenderID': {
			DataType: 'String',
			StringValue: sender
		},
	},
	PhoneNumber: receiver
    }).promise()
	.then(data => {
        console.log("Sent message to", receiver);
        return data;
	})
	.catch(err => {
        console.log("Sending failed", err);
        return err;
	});
} 
