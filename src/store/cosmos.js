import axios from "axios";
import {
  Secp256k1Wallet,
  SigningCosmosClient,
  makeCosmoshubPath,
  coins,
} from "@cosmjs/launchpad";

const GITPOD =
  process.env.VUE_APP_CUSTOM_URL && new URL(process.env.VUE_APP_CUSTOM_URL);
const API =
  process.env.VUE_APP_API_COSMOS ||
  (GITPOD && `${GITPOD.protocol}//1317-${GITPOD.hostname}`) ||
  "http://localhost:1317";
const RPC =
  process.env.VUE_APP_API_TENDERMINT ||
  (GITPOD && `${GITPOD.protocol}//26657-${GITPOD.hostname}`) ||
  "http://localhost:26657";
const WS =
  process.env.VUE_APP_WS_TENDERMINT ||
  (GITPOD && `wss://26657-${GITPOD.hostname}/websocket`) ||
  "ws://localhost:26657/websocket";
const ADDR_PREFIX = process.env.VUE_APP_ADDRESS_PREFIX || "cosmos";

export default {
  namespaced: true,
  state: {
    account: {},
    client: null,
    chain_id: "",
    bankBalances: [],
    data: [],
  },
  mutations: {
    set(state, { key, value }) {
      state[key] = value;
    },
    entitySet(state, { type, body }) {
      const updated = {};
      updated[type] = body;
      state.data = { ...state.data, ...updated };
    },
  },
  actions: {
    async init({ dispatch }) {
      // dispatch("stakingPoolFetch");
      // dispatch("validatorsFetch");
      await dispatch("chainIdFetch");
      await dispatch("accountSignInTry");
    },
    async accountSignInTry({ dispatch }) {
      const mnemonic = localStorage.getItem("mnemonic");
      if (mnemonic) {
        await dispatch("accountSignIn", { mnemonic });
      }
    },
    async chainIdFetch({ commit }) {
      const url = `${API}/node_info`;
      const value = (await axios.get(url)).data.node_info.network;
      commit("set", { key: "chain_id", value });
    },
    accountSignIn({ commit, dispatch }, { mnemonic }) {
      return new Promise(async (resolve, reject) => {
        const wallet = await Secp256k1Wallet.fromMnemonic(
          mnemonic,
          makeCosmoshubPath(0),
          ADDR_PREFIX
        );
        localStorage.setItem("mnemonic", mnemonic);
        const [{ address }] = await wallet.getAccounts();
        const url = `${API}/auth/accounts/${address}`;
        const acc = (await axios.get(url)).data;
        const account = acc.result.value;
        commit("set", { key: "account", value: account });
        const client = new SigningCosmosClient(API, address, wallet);
        commit("set", { key: "client", value: client });
        // // dispatch("delegationsFetch");
        // // dispatch("transfersIncomingFetch");
        // // dispatch("transfersOutgoingFetch");
        try {
          await dispatch("bankBalancesGet");
        } catch {
          console.log("Error in getting a bank balance.");
        }
        // resolve(account);
      });
    },
    async tokenSend({ state }, { amount, denom, to_address, memo = "" }) {
      const from_address = state.client.senderAddress;
      const msg = {
        type: "cosmos-sdk/MsgSend",
        value: {
          amount: [
            {
              amount,
              denom,
            },
          ],
          from_address,
          to_address,
        },
      };
      const fee = {
        amount: coins(200, denom),
        gas: "200000",
      };
      return await state.client.signAndPost([msg], fee, memo);
    },
    async bankBalancesGet({ commit, state }) {
      const { address } = state.account;
      const url = `${API}/bank/balances/${address}`;
      const value = (await axios.get(url)).data.result;
      commit("set", { key: "bankBalances", value });
    },
    async accountSignOut({ commit }) {
      localStorage.removeItem("mnemonic");
      window.location.reload();
    },
    async entityFetch({ state, commit, dispatch }, { type }) {
      if (!state.chain_id) {
        await dispatch("chainIdFetch");
      }
      const url = `${API}/${state.chain_id}/${type}`;
      const body = (await axios.get(url)).data.result;
      commit("entitySet", { type, body });
    },
    async entitySubmit({ state }, { type, body }) {
      const { chain_id } = state;
      const creator = state.client.senderAddress;
      const base_req = { chain_id, from: creator };
      const req = { base_req, creator, ...body };
      const { data } = await axios.post(`${API}/${chain_id}/${type}`, req);
      const { msg, fee, memo } = data.value;
      return await state.client.signAndPost(msg, fee, memo);
    },
  },
};
