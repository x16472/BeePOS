package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func supervise(ctx context.Context, wg *sync.WaitGroup, python, script, root string) {
	defer wg.Done()
	for ctx.Err() == nil {
		cmd := exec.CommandContext(ctx, python, "-u", filepath.Join(root, script))
		if runtime.GOOS == "windows" {
			// Windows venv 直譯器可能包含轉送行程，停止時需一併結束子行程。
			cmd.Cancel = func() error {
				return exec.Command("taskkill", "/PID", strconv.Itoa(cmd.Process.Pid), "/T", "/F").Run()
			}
		}
		cmd.Dir = root
		cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
		err := cmd.Run()
		if ctx.Err() != nil {
			return
		}
		log.Printf("服務 %s 已停止：%v；3 秒後重新啟動", script, err)
		select {
		case <-ctx.Done():
			return
		case <-time.After(3 * time.Second):
		}
	}
}

func proxy(port string) http.Handler {
	target, _ := url.Parse("http://127.0.0.1:" + port)
	p := httputil.NewSingleHostReverseProxy(target)
	p.Transport = &http.Transport{DialContext: (&net.Dialer{Timeout: 3 * time.Second}).DialContext, ResponseHeaderTimeout: 120 * time.Second}
	p.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusServiceUnavailable)
		fmt.Fprint(w, `{"error":"本機服務暫時無法連線，請保留購物車並重試"}`)
	}
	return p
}

func main() {
	root, err := filepath.Abs(env("BEE_ROOT", ".."))
	if err != nil {
		log.Fatal(err)
	}
	dist := env("BEE_STATIC_DIR", filepath.Join(root, "Mobile", "dist"))
	if _, err := os.Stat(filepath.Join(dist, "index.html")); err != nil {
		log.Fatal("請先於 Mobile 執行 npm run build")
	}
	logfile, err := os.OpenFile(filepath.Join(root, "Database", "main.log"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0600)
	if err != nil {
		log.Fatal(err)
	}
	defer logfile.Close()
	log.SetOutput(io.MultiWriter(os.Stderr, logfile))
	python := filepath.Join(root, ".venv", "Scripts", "python.exe")
	if _, err := os.Stat(python); err != nil {
		python = filepath.Join(root, ".venv", "bin", "python")
	}
	if _, err := exec.LookPath(python); err != nil {
		log.Fatal("找不到專案 .venv，請先建立 Python 虛擬環境")
	}
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt)
	defer cancel()
	appPort, syncPort := env("BEE_APP_PORT", "8765"), env("BEE_SYNC_PORT", "8766")
	// 啟動前確認私有連接埠可用，避免代理到非本專案的服務。
	for _, port := range []string{appPort, syncPort} {
		listener, err := net.Listen("tcp", "127.0.0.1:"+port)
		if err != nil {
			log.Fatal("Python 服務連接埠已被使用：", port)
		}
		listener.Close()
	}
	if appPort == syncPort {
		log.Fatal("兩個 Python 服務不可使用相同連接埠")
	}
	mux := http.NewServeMux()
	appProxy, syncProxy := proxy(appPort), proxy(syncPort)
	mux.Handle("/api/sync", syncProxy)
	mux.Handle("/api/sync/", syncProxy)
	mux.Handle("/api/", appProxy)
	files := http.FileServer(http.Dir(dist))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "不支援的操作", 405)
			return
		}
		files.ServeHTTP(w, r)
	})
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if strings.HasPrefix(r.URL.Path, "/api/") {
			w.Header().Set("Cache-Control", "no-store")
			if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+r.Host && origin != "https://"+r.Host {
				http.Error(w, "不接受跨來源要求", 403)
				return
			}
			r.Body = http.MaxBytesReader(w, r.Body, 1048576)
		}
		mux.ServeHTTP(w, r)
	})
	server := &http.Server{Addr: env("BEE_HOST", "0.0.0.0") + ":" + env("BEE_PORT", "8080"), Handler: handler, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second}
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		log.Fatal(err)
	}
	var wg sync.WaitGroup
	for _, script := range []string{"Backend/app_backend.py", "Database/app_db_sync.py"} {
		wg.Add(1)
		go supervise(ctx, &wg, python, script, root)
	}
	go func() {
		if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Print(err)
			cancel()
		}
	}()
	fmt.Printf("Bee POS 已啟動：http://localhost:%s（區網裝置請使用本機內部 IP）\n", env("BEE_PORT", "8080"))
	<-ctx.Done()
	shutdownCtx, stop := context.WithTimeout(context.Background(), 5*time.Second)
	defer stop()
	server.Shutdown(shutdownCtx)
	wg.Wait()
}
