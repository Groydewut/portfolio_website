package main

import (
	"net"
	"net/http"
	"sync"
	"time"
)

type rateLimiter struct {
	mu         sync.Mutex
	lastSeen   map[string]time.Time
	interval   time.Duration
	maxEntries int
}

func newRateLimiter(interval time.Duration, maxEntries int) *rateLimiter {
	return &rateLimiter{
		lastSeen:   make(map[string]time.Time),
		interval:   interval,
		maxEntries: maxEntries,
	}
}

func (l *rateLimiter) allow(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := time.Now()

	// Удаляем устаревшие записи.
	for storedIP, lastRequest := range l.lastSeen {
		if now.Sub(lastRequest) >= l.interval {
			delete(l.lastSeen, storedIP)
		}
	}

	lastRequest, exists := l.lastSeen[ip]

	if exists && now.Sub(lastRequest) < l.interval {
		return false
	}

	// Если IP новый, а карта заполнена,
	// удаляем запись с самым старым временем.
	if !exists && len(l.lastSeen) >= l.maxEntries {
		var oldestIP string
		var oldestTime time.Time

		for storedIP, lastRequest := range l.lastSeen {
			if oldestTime.IsZero() || lastRequest.Before(oldestTime) {
				oldestIP = storedIP
				oldestTime = lastRequest
			}
		}

		delete(l.lastSeen, oldestIP)
	}

	l.lastSeen[ip] = now
	return true
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}

	return host
}
