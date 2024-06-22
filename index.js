const axios = require('axios');
// const fs = require('fs');
const {updateExcelData, getExcelDataList, updateOneDataInExcel} = require("../utils/ExcelDataUtils");
const path = require("path");
const Queue = require('bull');
const crypto = require("crypto");
require('dotenv').config();
const key = crypto.randomBytes(32).toString('hex');
// const file = 'sei_address-1.txt'; // 接水地址
const threads = 5;
const redisUrl = 'redis://10.0.0.28:6379'; 
const time = require('../utils/time');

const file = path.join('./data', 'testData.xlsx');
// const file_no_used = path.join('./data', 'SeiWallet-no-claimed.xlsx');
// const file_used = path.join('./data', 'SeiWallet-claimed.xlsx');


async function getUsdcSeiBalance(i, address) {
    await time.sleep(500);
    return new Promise(async (resolve, reject) => {
        try {
            let axiosInstance = axios.create({
                timeout: 60000
            });
            const requestUrl = `https://celatone-api.alleslabs.dev/balances/sei/pacific-1/${address}`;
            let response = await axiosInstance.get(requestUrl);

            let seiRes = response.data.length>0 ? response.data[0] : null;
            // console.log('===response.data.eligible:',response.data.eligible);
            if( seiRes && seiRes.id == 'usei' ){ 
                let seiCoin = seiRes.amount;
                // let seiCoin = coinStr.substring(0, coinStr.length -4);
                let seiAmount = seiCoin ? parseInt(seiCoin) / 1000000 : 0;
                seiAmount = seiAmount > 0.01 ? seiAmount : 0 ;
                resolve({success: true, seiAmount: seiAmount});
            }else{
                resolve({success: true, seiAmount: '0'});
            }
            
        } catch (e) {
            resolve({success: false, seiAmount: 'error'});
        }
    });
}


async function checkAllBalance() {
    let walletList = await getExcelDataList(file);
    let get_balance = (j) => new Promise( async (resolve, reject) => {
        // let key = await crypto.randomBytes(32).toString('hex');
        const queue = new Queue('check_balance' + '_' + key + j , redisUrl); //
        queue.empty();
        queue.process(5, async function (job, done) {
            let wallet = job.data.wallet;
            let address = wallet.address;
            let id = wallet.id;
            try {
                console.log('Processing job:', id, address);
                if (address) {
                    let {success, seiAmount} = await getUsdcSeiBalance(id, address);

                    wallet.amount = seiAmount;//'claimed';
                    wallet.checkBalance = success;
                    await updateOneDataInExcel(walletList, id, wallet, file);
                    if (success) {
                        
                        console.log('\x1b[32m%s\x1b[0m', '查询余额成功amount=' + seiAmount + '--' + address + "--" + id);
              
                    } else {
                        console.log('\x1b[33m%s\x1b[0m', '查询余额失败或0----' + address + "--" + id);
                    }

                } else {
                    // noUSDCBalanceFs.write(address + '\n');
                    console.log('\x1b[33m%s\x1b[0m', '查询余额失败--address is null');
                }
            } catch (e) {
                // noUSDCBalanceFs.write(address + '\n');
                console.log('\x1b[35m%s\x1b[0m', '查询余额失败--catch--Error---queue.process--' + id);
                console.log(e);
            }
            return done(null, address);
        });
        queue.on('completed', function (job, result) {
            console.log('completed', job.data.i);
        });
        queue.on('drained', async function (jobs, type) {
            resolve('done');
            queue.close();
        });

        for (let i = 0; i < walletList.length; i++) {
            console.log('adding job:', i);
            let seiWallet = walletList[i];
            if (seiWallet  && seiWallet.checkBalance != true) { //&& seiWallet.claimStatus == 'claimed'
                await queue.add({i: i, wallet: seiWallet});
            }
        }
    });
    get_balance();
}

checkAllBalance();



