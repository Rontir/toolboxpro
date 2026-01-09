"""
BACKUP - Oryginalna wersja PikoEmpiko.process_safe (RAM-based)
Data utworzenia: 2026-01-09
Powód backupu: Zmiana na disk-based processing z powodu OOM na Render

Aby przywrócić:
1. Skopiuj zawartość tej funkcji
2. Zamień process_safe w backend_processor.py
3. Usuń parametr job_id z server.py (process_task)
"""

# Oryginalna wersja - wszystko w RAM
@classmethod
def process_safe_ORIGINAL_BACKUP(cls, file_content: bytes, col_index: str, col_main: str, col_extra: str, 
                 progress_callback=None, batch_size: int = 0, create_zip: bool = False,
                 compress_jpg: bool = False, convert_format: str = 'jpg',
                 max_resolution: int = 0, resume: bool = False,
                 pim_version: str = 'PIM3') -> io.BytesIO:
    """
    Full PikoEmpiko download with all advanced features.
    Returns BytesIO with ZIP file.
    """
    from datetime import datetime
    
    df = pd.read_excel(io.BytesIO(file_content), dtype=str)
    total_rows = len(df)
    processed_rows = 0
    
    session = requests.Session()
    session.headers.update({"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"})
    
    lock = threading.Lock()
    
    # Store results in memory
    results = []
    downloaded_files = []  # List of (filename, bytes)
    failed_downloads = []
    
    def process_row(row_data):
        nonlocal processed_rows
        idx, row = row_data
        indeks = str(row.get(col_index, '')).strip()
        
        if not indeks or indeks.lower() == 'nan': 
            with lock:
                processed_rows += 1
                if progress_callback: progress_callback(processed_rows, total_rows)
            return None
        
        result = {
            'Indeks MDM': indeks,
            'Zdjęcie okładki/produktu': '',
            'Dodatkowe zdjęcia': '',
            'Błędy': ''
        }
        errors = []
        
        # Main photo
        main_url = str(row.get(col_main, '')).strip()
        if main_url and main_url.lower() != 'nan':
            data, error_msg = cls.download_file(main_url, session)
            if data:
                filename = f"{indeks}.jpg"
                result['Zdjęcie okładki/produktu'] = filename
                with lock:
                    downloaded_files.append((filename, data))
            else:
                errors.append(f"Główne: {error_msg}")
                with lock:
                    failed_downloads.append((main_url, indeks, 'main', error_msg))

        # Extra photos
        extra_cols = [c for c in df.columns if str(c).startswith(col_extra)]
        extra_filenames = []
        for i, col in enumerate(extra_cols):
            url = str(row.get(col, '')).strip()
            if url and url.lower() != 'nan':
                data, error_msg = cls.download_file(url, session)
                if data:
                    filename = f"{indeks}_{i+1}.jpg"
                    extra_filenames.append(filename)
                    with lock:
                        downloaded_files.append((filename, data))
                else:
                    errors.append(f"Dodatkowe {i+1}: {error_msg}")
                    with lock:
                        failed_downloads.append((url, indeks, 'extra', error_msg))
        
        result['Dodatkowe zdjęcia'] = ';'.join(extra_filenames)
        result['Błędy'] = '; '.join(errors) if errors else ''
        
        with lock:
            results.append(result)
            processed_rows += 1
            if progress_callback: progress_callback(processed_rows, total_rows)
        
        return result

    # Process all rows with ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=10) as executor:
        list(executor.map(process_row, list(df.iterrows())))
    
    # Create result DataFrame
    df_result = pd.DataFrame(results)
    
    # Create output ZIP in memory
    output_zip = io.BytesIO()
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    # Calculate batch info
    total_products = len(df_result)
    
    with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zipf:
        
        # === BATCH SPLITTING LOGIC ===
        if batch_size > 0 and total_products > batch_size:
            num_batches = (total_products + batch_size - 1) // batch_size
            logging.info(f"📦 Dzielenie na {num_batches} paczek po {batch_size} produktów")
            
            for batch_num in range(num_batches):
                start_idx = batch_num * batch_size
                end_idx = min((batch_num + 1) * batch_size, total_products)
                
                batch_name = f"paczka_{batch_num + 1}_of_{num_batches}"
                df_batch = df_result.iloc[start_idx:end_idx].copy()
                
                # Get files for this batch
                batch_indices = set(df_batch['Indeks MDM'].tolist())
                batch_files = [(fn, data) for fn, data in downloaded_files 
                               if fn.split('.')[0].split('_')[0] in batch_indices]
                
                if create_zip:
                    # Create separate ZIP for each batch
                    batch_zip = io.BytesIO()
                    with zipfile.ZipFile(batch_zip, 'w', zipfile.ZIP_DEFLATED) as bzipf:
                        for filename, data in batch_files:
                            bzipf.writestr(filename, data)
                    batch_zip.seek(0)
                    zipf.writestr(f"{batch_name}.zip", batch_zip.read())
                else:
                    # Add files to folder in main ZIP
                    for filename, data in batch_files:
                        zipf.writestr(f"{batch_name}/{filename}", data)
                
                # Create batch Excel
                batch_excel = io.BytesIO()
                with pd.ExcelWriter(batch_excel, engine='openpyxl') as writer:
                    df_batch_success = df_batch[df_batch['Błędy'].fillna('') == ''].copy()
                    if pim_version == 'PIM4':
                        df_batch_success.insert(0, 'Typ', 'singiel')
                    df_batch_success.to_excel(writer, index=False, sheet_name='Wynik')
                    
                    batch_errors = [e for e in failed_downloads if e[1] in batch_indices]
                    if batch_errors:
                        df_batch_errors = pd.DataFrame([{
                            'Indeks MDM': idx,
                            'Typ zdjęcia': 'Główne' if typ == 'main' else 'Dodatkowe',
                            'URL': url,
                            'Błąd': error_code
                        } for url, idx, typ, error_code in batch_errors])
                        df_batch_errors.to_excel(writer, index=False, sheet_name='❌ Błędy')
                
                batch_excel.seek(0)
                zipf.writestr(f"wynik_{batch_name}.xlsx", batch_excel.read())
                
                logging.info(f"  ✅ Paczka {batch_num + 1}: {len(df_batch)} produktów, {len(batch_files)} zdjęć")
        else:
            # No batching - add all files to root
            for filename, data in downloaded_files:
                zipf.writestr(filename, data)
        
        # === MAIN RESULT EXCEL ===
        excel_buffer = io.BytesIO()
        with pd.ExcelWriter(excel_buffer, engine='openpyxl') as writer:
            df_success = df_result[df_result['Błędy'].fillna('') == ''].copy()
            if pim_version == 'PIM4':
                df_success.insert(0, 'Typ', 'singiel')
                logging.info("📋 Format PIM4: dodano kolumnę 'Typ' z wartością 'singiel'")
            
            df_success.to_excel(writer, index=False, sheet_name='Wynik')
            
            df_all = df_result.copy()
            if pim_version == 'PIM4':
                df_all.insert(0, 'Typ', 'singiel')
            df_all.to_excel(writer, index=False, sheet_name='Wszystkie')
            
            # Summary
            success_count = len(df_success)
            failed_count = len(df_result) - success_count
            total_photos = len(downloaded_files)
            
            summary_data = pd.DataFrame([{
                '📊 Razem produktów': total_rows,
                '✅ Pobrane pomyślnie': success_count,
                '❌ Z błędami': failed_count,
                '🖼️ Zdjęć pobranych': total_photos,
                '📦 Liczba paczek': (total_products + batch_size - 1) // batch_size if batch_size > 0 else 1,
                '% Sukcesu': f"{(success_count/total_rows*100) if total_rows else 0:.1f}%"
            }])
            summary_data.to_excel(writer, index=False, sheet_name='Podsumowanie')

        excel_buffer.seek(0)
        zipf.writestr("RAPORT_CALOSCIOWY.xlsx", excel_buffer.read())
    
    output_zip.seek(0)
    return output_zip


# ============================================================
# BACKUP server.py process_task (RAM version)
# ============================================================
"""
def process_task(jid, content, idx, main, extra, options):
    try:
        from backend_processor import PikoEmpiko
        output_io = PikoEmpiko.process_safe(
            content, idx, main, extra, 
            progress_callback=lambda c, t: update_progress(jid, c, t),
            batch_size=options['batch_size'],
            create_zip=options['create_zip'],
            compress_jpg=options['compress_jpg'],
            convert_format=options['convert_format'],
            max_resolution=options['max_resolution'],
            resume=options['resume'],
            pim_version=options['pim_version']
        )
        
        # Save result to temp file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"piko_images_{timestamp}.zip"
        temp_path = f"temp_{jid}_{filename}"
        
        with open(temp_path, "wb") as f:
            f.write(output_io.getvalue())
            
        jobs[jid]['status'] = 'completed'
        jobs[jid]['result'] = {'file_path': temp_path, 'filename': filename}
        jobs[jid]['progress'] = 100
    except Exception as e:
        jobs[jid]['status'] = 'error'
        jobs[jid]['error'] = str(e)
"""
