import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { FC, useCallback, useMemo, useState,useEffect } from 'react';
import { notify } from "../utils/notifications";
import useUserSOLBalanceStore from '../stores/useUserSOLBalanceStore';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, transactionBuilder, publicKey, some } from '@metaplex-foundation/umi';
import { fetchCandyMachine, mintV2, mplCandyMachine, safeFetchCandyGuard } from "@metaplex-foundation/mpl-candy-machine";
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata';
import { setComputeUnitLimit } from '@metaplex-foundation/mpl-toolbox';
import { clusterApiUrl } from '@solana/web3.js';
import * as bs58 from 'bs58';
import { fetchDigitalAsset, fetchAllDigitalAssetByOwner } from '@metaplex-foundation/mpl-token-metadata';
import { isSome } from '@metaplex-foundation/umi';
import { getAccount, getAssociatedTokenAddress } from '@solana/spl-token';
import {PublicKey as Web3PublicKey } from '@solana/web3.js';


// These access the environment variables we defined in the .env file
const quicknodeEndpoint = process.env.NEXT_PUBLIC_RPC || clusterApiUrl('mainnet-beta');
const candyMachineAddress = publicKey(process.env.NEXT_PUBLIC_CANDY_MACHINE_ID);
const treasury = publicKey(process.env.NEXT_PUBLIC_TREASURY);
//const requiredSPLTokenMint = publicKey('64hiNSdNeXr5Wt1BpGDBc5fb4JLszj3kT86CWduzcsZu'); // Replace with your token mint
const minimumRequiredAmount = 1000000 * 10 ** 6; // 100k tokens, assuming 6 decimals

export const CandyMint: FC = (props) => {
    const { connection } = useConnection();
    const wallet = useWallet();
    const { getUserSOLBalance } = useUserSOLBalanceStore();
    const [count,setCount]=useState(0);
    const [alreadyMinted, setAlreadyMinted] = useState(false);

    const umi = useMemo(() =>
        createUmi(quicknodeEndpoint)
            .use(walletAdapterIdentity(wallet))
            .use(mplCandyMachine())
            .use(mplTokenMetadata()),
        [wallet, mplCandyMachine, walletAdapterIdentity, mplTokenMetadata, quicknodeEndpoint, createUmi]
    );
    const checkSPLTokenBalance = useCallback(async (): Promise<boolean> => {
        if (!wallet.publicKey) return false;
    
        try {
            const ata = await getAssociatedTokenAddress(
                new Web3PublicKey('CwZtPnDPPS8tJwSjKWwQEPxUVf2tdxVpqgiPfmo2pump'), // Convert Umi PublicKey to web3.js
                wallet.publicKey
            );
    
            const account = await getAccount(connection, ata);
            const balance = Number(account.amount);
    
            console.log(`SPL Token Balance: ${balance}`);
            return balance >= minimumRequiredAmount;
        } catch (error) {
            console.error('SPL Token balance check failed:', error);
            return false;
        }
    }, [wallet.publicKey, connection]);
    
    const checkAlreadyMintedInTier = useCallback(async (): Promise<boolean> => {
        if (!wallet.publicKey) return false;
    
        try {
            const owner = publicKey(wallet.publicKey.toString());
            const allNfts = await fetchAllDigitalAssetByOwner(umi, owner);
    
            const candyMachine = await fetchCandyMachine(umi, candyMachineAddress);
            const currentCollectionMint = candyMachine.collectionMint.toString();
    
            for (const nft of allNfts) {
                if (isSome(nft.metadata.collection)) {
                    const collection = nft.metadata.collection.value;
                    const collectionKey = collection.key.toString();
                    const isVerified = collection.verified;
    
                    if (collectionKey === currentCollectionMint && isVerified) {
                        console.log('❌ Already minted in this tier.');
                        return true;
                    }
                }
            }
    
            return false;
        } catch (error) {
            console.error('Error checking tier minting:', error);
            return false;
        }
    }, [wallet, umi, candyMachineAddress]);
    
    const onClick = useCallback(async () => {
        if (!wallet.publicKey) {
            console.log('error', 'Wallet not connected!');
            notify({ type: 'error', message: 'error', description: 'Wallet not connected!' });
            return;
        }

        // Fetch the Candy Machine.
        const candyMachine = await fetchCandyMachine(
            umi,
            candyMachineAddress,
        );

        const hasEnoughSPL = await checkSPLTokenBalance();
if (!hasEnoughSPL) {
    notify({ type: 'error', message: 'You must hold at least 1M tokens on your wallet to mint.' });
    return;
}

        // Fetch the Candy Guard.
        const alreadyMintedInTier = await checkAlreadyMintedInTier();
        if (alreadyMintedInTier) {
            notify({ type: 'error', message: 'You have already minted in this tier.' });
            return;
        }
        const candyGuard = await safeFetchCandyGuard(
            umi,
            candyMachine.mintAuthority,
        );
        try {
            // Mint from the Candy Machine.
            const nftMint = generateSigner(umi);
            const transaction = await transactionBuilder()
                .add(setComputeUnitLimit(umi, { units: 800_000 }))
                .add(
                    mintV2(umi, {
                        candyMachine: candyMachine.publicKey,
                        candyGuard: candyGuard?.publicKey,
                        nftMint,
                        collectionMint: candyMachine.collectionMint,
                        collectionUpdateAuthority: candyMachine.authority,
                        mintArgs: {
                            solPayment: some({ destination: treasury }),
                        },
                    })
                );
            const { signature } = await transaction.sendAndConfirm(umi, {
                confirm: { commitment: "confirmed" },
            });
            const txid = bs58.encode(signature);
            setCount(count+1);
            console.log('success', `Mint successful! ${txid}`)
            notify({ type: 'success', message: 'Mint successful!', txid });

            getUserSOLBalance(wallet.publicKey, connection);
        } catch (error: any) {
            notify({ type: 'error', message: `Error minting!`, description: error?.message });
            console.log('error', `Mint failed! ${error?.message}`);
        }
    }, [wallet, connection, getUserSOLBalance, umi, candyMachineAddress, treasury]);
  
    useEffect(() => {
        if (wallet.publicKey) {
            checkAlreadyMintedInTier().then(setAlreadyMinted);
        }
    }, [wallet.publicKey, checkAlreadyMintedInTier]);
    return (

        <div className="flex flex-row justify-center align-middle">

        <div className="relative group items-center text-center">

            <div className="m-1 absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-fuchsia-500 rounded-lg blur opacity-20 group-hover:opacity-100 transition duration-1000 group-hover:duration-200 animate-tilt">  
            </div>
            <button
                className="px-8 m-2 btn text-center align-middle animate-pulse bg-gradient-to-br from-indigo-500 to-fuchsia-500 hover:from-white hover:to-purple-300 text-black"
                onClick={onClick}
            >
                <span>Mint  Bronze NFT </span>
            </button>
        </div>

    </div>


        
    );
};

