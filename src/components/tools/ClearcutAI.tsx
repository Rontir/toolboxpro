"use client"

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDropzone } from 'react-dropzone';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';
import ReactCrop, { Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { FiUpload, FiDownload, FiScissors, FiTrash2, FiRefreshCw, FiImage } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

interface ClearcutAIProps {
    // Props if needed
}

export default function ClearcutAI({ }: ClearcutAIProps) {
    const [file, setFile] = useState<File | null>(null);
    const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
    const [processedImageUrl, setProcessedImageUrl] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

    // Dropzone setup
    const onDrop = async (acceptedFiles: File[]) => {
        const file = acceptedFiles[0];
        if (!file) return;

        setFile(file);
        const objectUrl = URL.createObjectURL(file);
        setOriginalImageUrl(objectUrl);
        setProcessedImageUrl(null); // Reset previous result

        // Auto-start processing
        await processImage(file);
    };

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: {
            'image/*': ['.png', '.jpg', '.jpeg', '.webp']
        },
        maxFiles: 1
    });

    const processImage = async (fileToProcess: File) => {
        setIsProcessing(true);
        const formData = new FormData();
        formData.append('file', fileToProcess);

        try {
            // Use the newly created API endpoint
            const response = await fetch('http://localhost:8000/api/clearcut/remove-bg', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) throw new Error('Failed to remove background');

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            setProcessedImageUrl(url);
            toast.success('Background removed successfully!');
        } catch (error) {
            console.error(error);
            toast.error('Failed to process image');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownload = () => {
        if (!processedImageUrl) return;
        const link = document.createElement('a');
        link.href = processedImageUrl;
        link.download = `clearcut_${file?.name || 'image'}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleReset = () => {
        setFile(null);
        setOriginalImageUrl(null);
        setProcessedImageUrl(null);
        setCrop(undefined);
        setCompletedCrop(undefined);
    };

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900 p-6 rounded-xl shadow-sm">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent flex items-center gap-2">
                        <FiScissors /> Clearcut AI
                    </h2>
                    <p className="text-gray-500 dark:text-gray-400">Instantly remove backgrounds from images</p>
                </div>
                {processedImageUrl && (
                    <button
                        onClick={handleReset}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600"
                    >
                        <FiRefreshCw /> New Image
                    </button>
                )}
            </div>

            <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
                {!originalImageUrl ? (
                    <div
                        {...getRootProps()}
                        className={`border-3 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors w-full h-full flex flex-col items-center justify-center
              ${isDragActive
                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                                : 'border-gray-300 hover:border-violet-400 bg-white dark:bg-gray-800 dark:border-gray-700'
                            }`}
                    >
                        <input {...getInputProps()} />
                        <div className="w-20 h-20 bg-violet-100 dark:bg-violet-900/50 rounded-full flex items-center justify-center mb-4 text-violet-600 dark:text-violet-400">
                            <FiUpload size={32} />
                        </div>
                        <p className="text-xl font-medium text-gray-700 dark:text-gray-200 mb-2">
                            Drop your image here
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Supports PNG, JPG, WEBP up to 10MB
                        </p>
                    </div>
                ) : (
                    <div className="w-full h-full flex flex-col md:flex-row gap-6">
                        {/* Main Preview Area */}
                        <div className="flex-1 bg-gray-100 dark:bg-gray-800/50 rounded-xl overflow-hidden relative flex items-center justify-center border border-gray-200 dark:border-gray-700">
                            {isProcessing ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 dark:bg-gray-900/80 z-10 backdrop-blur-sm">
                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-violet-500 border-t-transparent mb-4"></div>
                                    <p className="font-medium text-gray-700 dark:text-gray-200">Processing...</p>
                                </div>
                            ) : null}

                            {processedImageUrl ? (
                                <ReactCompareSlider
                                    itemOne={<ReactCompareSliderImage src={originalImageUrl} alt="Original" />}
                                    itemTwo={<ReactCompareSliderImage src={processedImageUrl} alt="Processed" style={{ background: 'url(https://img.freepik.com/free-vector/checkered-pattern_1017-9430.jpg?w=740&t=st=1708704259~exp=1708704859~hmac=a41c10d3f20d7d6f5f3e2e2a5d5a8c1c0c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c) repeat' }} />}
                                    className="h-full w-full object-contain"
                                    style={{ height: '100%', width: '100%' }}
                                />
                            ) : (
                                <img src={originalImageUrl} alt="Original" className="max-h-full max-w-full object-contain" />
                            )}
                        </div>

                        {/* Sidebar / Controls */}
                        <div className="w-full md:w-80 flex flex-col gap-4">
                            <div className="bg-white dark:bg-gray-800 p-5 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
                                <h3 className="font-semibold mb-4 text-gray-800 dark:text-gray-200 flex items-center gap-2">
                                    <FiImage /> Actions
                                </h3>

                                <button
                                    onClick={handleDownload}
                                    disabled={!processedImageUrl}
                                    className={`w-full py-3 px-4 rounded-lg flex items-center justify-center gap-2 font-medium transition-all
                      ${processedImageUrl
                                            ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md hover:shadow-lg hover:from-violet-500 hover:to-indigo-500'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500'
                                        }`}
                                >
                                    <FiDownload /> Download Result
                                </button>
                            </div>

                            <div className="bg-violet-50 dark:bg-violet-900/20 p-4 rounded-xl text-sm text-violet-700 dark:text-violet-300">
                                <p>✨ <strong>Tip:</strong> Drag the slider on the image to see the difference!</p>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
