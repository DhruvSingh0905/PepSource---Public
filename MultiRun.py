#!/usr/bin/env python3
import subprocess
import sys
import os
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(f"sequential_runner_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("sequential_runner")

def run_script(script_path):
    """
    Run a Python script and directly pass through all output to terminal
    """
    if not os.path.exists(script_path):
        logger.error(f"Script not found: {script_path}")
        return False
    
    logger.info(f"Starting script: {script_path}")
    print(f"\n{'='*50}\nRUNNING: {script_path}\n{'='*50}\n")
    
    try:
        # Use subprocess.call to directly pass through all stdout/stderr
        # This will show output in real-time with no buffering issues
        return_code = subprocess.call([sys.executable, script_path])
        
        if return_code != 0:
            logger.error(f"Script failed with exit code {return_code}: {script_path}")
            return False
        
        logger.info(f"Successfully completed script: {script_path}")
        return True
    
    except Exception as e:
        logger.error(f"Error running script {script_path}: {str(e)}")
        return False

def main():
    # List of scripts to run in order
    scripts = [
        r"DB/Batch_requests/CompoundFormBatch.py",
        r"DB//Batch_requests/dosingBatch.py",
        r"DB/Batch_requests/embeddings_gen.py",
    ]
    
    logger.info(f"Starting sequential execution of {len(scripts)} scripts")
    
    for i, script in enumerate(scripts, 1):
        logger.info(f"Running script {i}/{len(scripts)}: {script}")
        success = run_script(script)
        
        if not success:
            user_response = input(f"Script {script} failed. Continue? (y/n): ").lower()
            if user_response != 'y':
                logger.info("Execution stopped by user after script failure")
                break
    
    logger.info("Sequential execution completed")

if __name__ == "__main__":
    main()